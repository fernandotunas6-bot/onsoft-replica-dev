/**
 * Inscrição por unidade curricular e precedências (ensino superior).
 *
 * `course_unit_enrollments` e `program_subject_prerequisites` são só do
 * servidor (FORCE RLS, sem concessões): aqui valida-se o papel, a escola do
 * vínculo activo e as regras do regulamento (course-units.ts). Cada escrita
 * fica em audit_logs pelo gatilho das tabelas.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { recordAccessAudit } from "@/features/audit/record-audit";
import { parseHigherEdRegulation, type HigherEdRegulation } from "./higher-ed-regulation";
import {
  checkUnitEnrollment,
  gradeUnit,
  hasPrerequisiteCycle,
  studentProgress,
  unitSituations,
  type CourseUnitStatus,
  type CurriculumUnit,
  type UnitEnrollment,
  type UnitSituation,
} from "./course-units";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

const OFFICE_ROLES = ["Administrador", "Secretaria"] as const;

const uuid = z.string().uuid();
const grade = z.number().min(0).max(20).nullable().optional();

async function readRegulation(db: Db, schoolId: string): Promise<HigherEdRegulation> {
  const { data } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", "higher_education")
    .maybeSingle();
  return parseHigherEdRegulation(data?.value ?? null);
}

async function activeYear(db: Db, schoolId: string) {
  const { data } = await db
    .from("academic_years")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data as { id: string; name: string } | null;
}

async function requireStudent(db: Db, schoolId: string, studentId: string) {
  const { data } = await db
    .from("students")
    .select("id")
    .eq("school_id", schoolId)
    .eq("id", studentId)
    .maybeSingle();
  if (!data) throw new Error("Aluno não encontrado nesta escola.");
}

async function loadCurriculum(db: Db, schoolId: string, programId: string) {
  const { data: rows, error } = await db
    .from("program_subjects")
    .select("id, subject_id, semester, credits")
    .eq("school_id", schoolId)
    .eq("program_id", programId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("semester");
  if (error) throw publicDatabaseError(error, "Não foi possível carregar o plano do curso.");
  const ids = (rows ?? []).map((row) => row.id);
  const subjectIds = [...new Set((rows ?? []).map((row) => row.subject_id))];
  const [subjects, prerequisites] = await Promise.all([
    subjectIds.length
      ? db.from("subjects").select("id, name").eq("school_id", schoolId).in("id", subjectIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ids.length
      ? db
          .from("program_subject_prerequisites")
          .select("program_subject_id, required_program_subject_id")
          .eq("school_id", schoolId)
          .in("program_subject_id", ids)
      : Promise.resolve({
          data: [] as Array<{ program_subject_id: string; required_program_subject_id: string }>,
        }),
  ]);
  const nameById = new Map((subjects.data ?? []).map((s) => [s.id, s.name]));
  const required = new Map<string, string[]>();
  for (const p of prerequisites.data ?? []) {
    required.set(p.program_subject_id, [
      ...(required.get(p.program_subject_id) ?? []),
      p.required_program_subject_id,
    ]);
  }
  return (rows ?? []).map((row): CurriculumUnit => ({
    programSubjectId: row.id,
    subjectName: nameById.get(row.subject_id) ?? "—",
    semester: row.semester,
    credits: Number(row.credits),
    prerequisites: required.get(row.id) ?? [],
  }));
}

async function loadEnrollments(db: Db, schoolId: string, studentId: string, programId: string) {
  const { data, error } = await db
    .from("course_unit_enrollments")
    .select(
      "id, program_subject_id, academic_year_id, status, final_grade, credits, credits_earned, attempt",
    )
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("program_id", programId);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar as inscrições.");
  return (data ?? []).map((row): UnitEnrollment => ({
    id: row.id,
    programSubjectId: row.program_subject_id,
    academicYearId: row.academic_year_id,
    status: row.status as CourseUnitStatus,
    finalGrade: row.final_grade == null ? null : Number(row.final_grade),
    credits: Number(row.credits),
    creditsEarned: Number(row.credits_earned),
    attempt: row.attempt,
  }));
}

/** Ano curricular pelos créditos obtidos: 45 de 60 no 1.º ano → 2.º ano. */
function curricularYearFor(reg: HigherEdRegulation, earned: number, maxSemester: number) {
  const years = Math.max(1, Math.ceil(maxSemester / 2));
  let year = 1;
  let needed = 0;
  while (year < years) {
    needed += Math.ceil((reg.creditsPerYear * reg.progressionPercentage) / 100);
    if (earned < needed) break;
    year += 1;
  }
  return year;
}

export type CourseUnitRow = CurriculumUnit & {
  situation: UnitSituation;
  enrollment: UnitEnrollment | null;
};

export type StudentCourseUnits = {
  available: boolean;
  programs: Array<{ id: string; name: string }>;
  programId: string | null;
  academicYear: { id: string; name: string } | null;
  curricularYear: number;
  units: CourseUnitRow[];
  progress: ReturnType<typeof studentProgress> | null;
  regulation: HigherEdRegulation;
};

export const getStudentCourseUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ studentId: uuid, programId: uuid.optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StudentCourseUnits> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...OFFICE_ROLES,
    ]);
    const schoolId = membership.schoolId;
    const db = await loadSgaAdminClient();
    await requireStudent(db, schoolId, data.studentId);
    const regulation = await readRegulation(db, schoolId);

    // Cursos com plano curricular: só esses são do regime de créditos.
    const { data: withPlan } = await db
      .from("program_subjects")
      .select("program_id")
      .eq("school_id", schoolId)
      .is("deleted_at", null);
    const programIds = [...new Set((withPlan ?? []).map((row) => row.program_id))];
    const empty: StudentCourseUnits = {
      available: false,
      programs: [],
      programId: null,
      academicYear: null,
      curricularYear: 1,
      units: [],
      progress: null,
      regulation,
    };
    if (!programIds.length) return empty;
    const { data: programRows } = await db
      .from("programs")
      .select("id, name")
      .eq("school_id", schoolId)
      .in("id", programIds)
      .order("name");
    const programs = (programRows ?? []).map((p) => ({ id: p.id, name: p.name }));
    if (!programs.length) return empty;

    // Curso: o pedido, senão o da última inscrição do estudante, senão o primeiro.
    let programId: string = programs[0]!.id;
    if (data.programId && programIds.includes(data.programId)) {
      programId = data.programId;
    } else {
      const { data: last } = await db
        .from("course_unit_enrollments")
        .select("program_id")
        .eq("school_id", schoolId)
        .eq("student_id", data.studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.program_id) programId = last.program_id;
    }

    const [year, units, enrollments] = await Promise.all([
      activeYear(db, schoolId),
      loadCurriculum(db, schoolId, programId),
      loadEnrollments(db, schoolId, data.studentId, programId),
    ]);
    const maxSemester = Math.max(1, ...units.map((u) => u.semester));
    const earnedBeforeYear = enrollments
      .filter((e) => e.academicYearId !== year?.id && ["aprovado", "dispensado"].includes(e.status))
      .reduce((total, e) => total + e.creditsEarned, 0);
    const curricularYear = curricularYearFor(regulation, earnedBeforeYear, maxSemester);
    const situations = unitSituations(regulation, {
      units,
      enrollments,
      academicYearId: year?.id ?? "",
      firstSemesterOfYear: 2 * (curricularYear - 1) + 1,
    });
    const currentById = new Map(
      enrollments
        .filter((e) => e.academicYearId === year?.id && e.status !== "anulado")
        .map((e) => [e.programSubjectId, e]),
    );

    return {
      available: true,
      programs,
      programId,
      academicYear: year,
      curricularYear,
      units: units.map((unit) => ({
        ...unit,
        situation: situations.get(unit.programSubjectId)!,
        enrollment: currentById.get(unit.programSubjectId) ?? null,
      })),
      progress: year ? studentProgress(regulation, units, enrollments, year.id) : null,
      regulation,
    };
  });

export const enrollCourseUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        studentId: uuid,
        programId: uuid,
        programSubjectIds: z.array(uuid).min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...OFFICE_ROLES],
    );
    const schoolId = membership.schoolId;
    const db = await loadSgaAdminClient();
    await requireStudent(db, schoolId, data.studentId);
    const year = await activeYear(db, schoolId);
    if (!year) throw new Error("Não há ano lectivo activo. Crie-o antes de inscrever.");
    const [regulation, units, enrollments] = await Promise.all([
      readRegulation(db, schoolId),
      loadCurriculum(db, schoolId, data.programId),
      loadEnrollments(db, schoolId, data.studentId, data.programId),
    ]);
    const situations = unitSituations(regulation, {
      units,
      enrollments,
      academicYearId: year.id,
      firstSemesterOfYear: 1,
    });
    const alreadyEnrolled = enrollments
      .filter((e) => e.academicYearId === year.id && e.status !== "anulado")
      .reduce((total, e) => total + e.credits, 0);
    const requested = [...new Set(data.programSubjectIds)];
    const check = checkUnitEnrollment(regulation, situations, units, requested, alreadyEnrolled);
    if (!check.ok) throw new Error(check.reason);

    const byId = new Map(units.map((u) => [u.programSubjectId, u]));
    const annulled = new Map(
      enrollments
        .filter((e) => e.academicYearId === year.id && e.status === "anulado")
        .map((e) => [e.programSubjectId, e.id]),
    );
    for (const id of requested) {
      const unit = byId.get(id)!;
      const situation = situations.get(id);
      const attempt = situation?.kind === "disponivel" ? situation.attempt : 1;
      // Uma inscrição anulada neste ano é reaberta (a chave é única por ano).
      const reopen = annulled.get(id);
      const { error } = reopen
        ? await db
            .from("course_unit_enrollments")
            .update({
              status: "inscrito",
              attempt,
              final_grade: null,
              season: null,
              credits_earned: 0,
              updated_by: context.userId,
            })
            .eq("id", reopen)
            .eq("school_id", schoolId)
        : await db.from("course_unit_enrollments").insert({
            school_id: schoolId,
            student_id: data.studentId,
            academic_year_id: year.id,
            program_id: data.programId,
            program_subject_id: id,
            semester: unit.semester,
            credits: unit.credits,
            attempt,
            created_by: context.userId,
            updated_by: context.userId,
          });
      if (error)
        throw publicDatabaseError(error, `Não foi possível inscrever em ${unit.subjectName}.`);
    }
    return { enrolled: requested.length };
  });

export const cancelCourseUnitEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ enrollmentId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...OFFICE_ROLES],
    );
    const db = await loadSgaAdminClient();
    const { data: row, error } = await db
      .from("course_unit_enrollments")
      .update({ status: "anulado", updated_by: context.userId })
      .eq("id", data.enrollmentId)
      .eq("school_id", membership.schoolId)
      .eq("status", "inscrito")
      .select("id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível anular a inscrição.");
    if (!row) throw new Error("Só se anula uma inscrição ainda sem resultado.");
    return { cancelled: true };
  });

export const recordCourseUnitGrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        enrollmentId: uuid,
        continuous: grade,
        absencePercentage: z.number().min(0).max(100).nullable().optional(),
        normalExam: grade,
        appealExam: grade,
        specialExam: grade,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...OFFICE_ROLES],
    );
    const schoolId = membership.schoolId;
    const db = await loadSgaAdminClient();
    const { data: row } = await db
      .from("course_unit_enrollments")
      .select("id, credits, status")
      .eq("id", data.enrollmentId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!row) throw new Error("Inscrição não encontrada.");
    if (row.status === "anulado") throw new Error("A inscrição está anulada.");
    const regulation = await readRegulation(db, schoolId);
    const record = gradeUnit(regulation, Number(row.credits), {
      continuous: data.continuous ?? null,
      absencePercentage: data.absencePercentage ?? null,
      normalExam: data.normalExam ?? null,
      appealExam: data.appealExam ?? null,
      specialExam: data.specialExam ?? null,
    });
    const { error } = await db
      .from("course_unit_enrollments")
      .update({ ...record, updated_by: context.userId })
      .eq("id", row.id)
      .eq("school_id", schoolId);
    if (error) throw publicDatabaseError(error, "Não foi possível gravar o resultado.");
    // As notas parciais não têm coluna própria: ficam no registo da acção.
    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "course_unit.graded",
      entityType: "course_unit_enrollments",
      entityId: row.id,
      metadata: {
        continuous: data.continuous ?? null,
        absencePercentage: data.absencePercentage ?? null,
        normalExam: data.normalExam ?? null,
        appealExam: data.appealExam ?? null,
        specialExam: data.specialExam ?? null,
        result: record,
      },
    });
    return record;
  });

export const setUnitPrerequisites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        programId: uuid,
        programSubjectId: uuid,
        requiredIds: z.array(uuid).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...OFFICE_ROLES],
    );
    const schoolId = membership.schoolId;
    const db = await loadSgaAdminClient();
    const units = await loadCurriculum(db, schoolId, data.programId);
    const ids = new Set(units.map((u) => u.programSubjectId));
    const required = [...new Set(data.requiredIds)].filter((id) => id !== data.programSubjectId);
    if (!ids.has(data.programSubjectId) || required.some((id) => !ids.has(id))) {
      throw new Error("As precedências têm de ser cadeiras do mesmo curso.");
    }
    const graph = new Map(units.map((u) => [u.programSubjectId, u.prerequisites]));
    graph.set(data.programSubjectId, required);
    if (hasPrerequisiteCycle(graph)) {
      throw new Error(
        "Estas precedências criam um ciclo (uma cadeira acabaria a exigir-se a si própria).",
      );
    }

    const { error: delError } = await db
      .from("program_subject_prerequisites")
      .delete()
      .eq("school_id", schoolId)
      .eq("program_subject_id", data.programSubjectId);
    if (delError) throw publicDatabaseError(delError, "Não foi possível gravar as precedências.");
    if (required.length) {
      const { error } = await db.from("program_subject_prerequisites").insert(
        required.map((id) => ({
          school_id: schoolId,
          program_subject_id: data.programSubjectId,
          required_program_subject_id: id,
          created_by: context.userId,
        })),
      );
      if (error) throw publicDatabaseError(error, "Não foi possível gravar as precedências.");
    }
    return { prerequisites: required };
  });

/** Precedências de cada cadeira de um curso, para o editor do plano. */
export const getProgramPrerequisites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ programId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<Record<string, string[]>> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...OFFICE_ROLES,
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const units = await loadCurriculum(db, membership.schoolId, data.programId);
    return Object.fromEntries(units.map((u) => [u.programSubjectId, u.prerequisites]));
  });
