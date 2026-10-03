/**
 * Ensino Superior no servidor: plano curricular dos cursos, precedências,
 * inscrições por cadeira, lançamento por época, histórico e regulamento.
 *
 * Privilégio por desenho: `program_subject_prerequisites` e
 * `course_unit_enrollments` não têm política para `authenticated` (só o
 * servidor lhes toca). Cada função exige o cargo e filtra pela escola da
 * sessão; as regras vêm do motor puro (engine.ts) e do regulamento da escola.
 *
 * Convenção da época «frequencia»: enquanto o estudante está admitido a exame,
 * a linha fica `status = inscrito`, `season = frequencia` e `final_grade` guarda
 * a média de frequência — é daí que a época normal a lê.
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
import {
  HIGHER_ED_DEFAULTS,
  parseSettingsDomain,
  readSettingsDomain,
  type HigherEdRegulation,
} from "@/features/school/settings-domains";
import { requireAal2 } from "@/features/hr/require-aal2";
import {
  academicSemesterOf,
  checkEnrollmentBatch,
  EXAM_SEASONS,
  findPrerequisiteCycles,
  frequencyOutcome,
  latestRecordByUnit,
  planTotals,
  seasonEligibility,
  seasonResult,
  studentProgress,
  validatePlan,
  type EnrollmentStatus,
  type ExamSeason,
  type PlanUnit,
  type Prerequisite,
  type UnitRecord,
} from "./engine";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));

const OFFICE = ["Administrador", "Secretaria"] as const;

async function officeMembership(
  context: { supabase: Parameters<typeof requireSgaWriterFor>[1]; userId: string },
  mode: "read" | "write",
) {
  const guard = mode === "write" ? requireSgaWriterForWrite : requireSgaWriterFor;
  return guard("pedagogica", context.supabase, context.userId, [...OFFICE]);
}

async function activeYearId(db: Db, schoolId: string) {
  const { data } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function requireProgram(db: Db, schoolId: string, programId: string) {
  const { data, error } = await db
    .from("programs")
    .select("id, name, code, kind, grading_profile")
    .eq("school_id", schoolId)
    .eq("id", programId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar o curso.");
  if (!data) throw new Error("Curso não encontrado nesta escola.");
  return data;
}

async function loadPlan(db: Db, schoolId: string, programId: string) {
  const { data: rows, error } = await db
    .from("program_subjects")
    .select("id, subject_id, semester, credits")
    .eq("school_id", schoolId)
    .eq("program_id", programId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("semester");
  if (error) throw publicDatabaseError(error, "Não foi possível carregar o plano do curso.");
  const subjectIds = [...new Set((rows ?? []).map((row) => str(row.subject_id)))];
  const { data: subjects } = subjectIds.length
    ? await db
        .from("subjects")
        .select("id, name, code")
        .eq("school_id", schoolId)
        .in("id", subjectIds)
    : { data: [] as Row[] };
  const subjectById = new Map(((subjects ?? []) as Row[]).map((s) => [str(s.id), s]));
  const units: PlanUnit[] = (rows ?? []).map((row) => ({
    id: str(row.id),
    subjectId: str(row.subject_id),
    name: str(subjectById.get(str(row.subject_id))?.name) || "Cadeira",
    semester: Number(row.semester),
    credits: Number(row.credits),
  }));
  const unitIds = units.map((unit) => unit.id);
  const { data: links, error: linksError } = unitIds.length
    ? await db
        .from("program_subject_prerequisites")
        .select("program_subject_id, required_program_subject_id")
        .eq("school_id", schoolId)
        .in("program_subject_id", unitIds)
    : { data: [] as Row[], error: null };
  if (linksError)
    throw publicDatabaseError(linksError, "Não foi possível carregar as precedências.");
  const prerequisites: Prerequisite[] = ((links ?? []) as Row[]).map((link) => ({
    unitId: str(link.program_subject_id),
    requiresUnitId: str(link.required_program_subject_id),
  }));
  return { units, prerequisites };
}

async function loadRecords(db: Db, schoolId: string, studentId: string, programId: string) {
  const { data, error } = await db
    .from("course_unit_enrollments")
    .select(
      "id, program_subject_id, academic_year_id, semester, credits, attempt, status, final_grade, season, credits_earned, updated_at",
    )
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("program_id", programId);
  if (error)
    throw publicDatabaseError(error, "Não foi possível carregar o histórico do estudante.");
  return ((data ?? []) as Row[]).map((row) => ({
    id: str(row.id),
    record: {
      unitId: str(row.program_subject_id),
      academicYearId: str(row.academic_year_id),
      attempt: Number(row.attempt ?? 1),
      status: str(row.status) as EnrollmentStatus,
      season: (row.season ? str(row.season) : null) as ExamSeason | null,
      finalGrade: row.final_grade == null ? null : Number(row.final_grade),
      credits: Number(row.credits ?? 0),
      creditsEarned: Number(row.credits_earned ?? 0),
      updatedAt: str(row.updated_at),
    } as UnitRecord,
  }));
}

async function regulationOf(db: Db, schoolId: string): Promise<HigherEdRegulation> {
  return readSettingsDomain(db, schoolId, "higher_ed");
}

/** O estudante tem matrícula activa (ou pendente) numa turma deste curso? */
async function requireStudentInProgram(
  db: Db,
  schoolId: string,
  studentId: string,
  programId: string,
) {
  const { data: grades } = await db
    .from("grade_levels")
    .select("id")
    .eq("school_id", schoolId)
    .eq("program_id", programId);
  const gradeIds = (grades ?? []).map((g) => str(g.id));
  if (!gradeIds.length) throw new Error("O curso não tem anos/classes configurados.");
  const { data: groups } = await db
    .from("class_groups")
    .select("id")
    .eq("school_id", schoolId)
    .in("grade_level_id", gradeIds);
  const groupIds = (groups ?? []).map((g) => str(g.id));
  const { data: enrollment } = groupIds.length
    ? await db
        .from("enrollments")
        .select("id")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .in("class_group_id", groupIds)
        .in("status", ["active", "pending"])
        .limit(1)
        .maybeSingle()
    : { data: null };
  if (!enrollment) throw new Error("O estudante não está matriculado neste curso.");
}

async function audit(
  db: Db,
  entry: { schoolId: string; actor: string; action: string; entityId: string; metadata: Row },
) {
  await db.from("audit_logs").insert({
    school_id: entry.schoolId,
    actor_user_id: entry.actor,
    action: entry.action,
    entity_type: "course_unit_enrollment",
    entity_id: entry.entityId,
    metadata: entry.metadata as never,
  });
}

// ── Cursos e plano ─────────────────────────────────────────────────────────

export const listHigherEdPrograms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("programs")
      .select("id, code, name, kind, is_active")
      .eq("school_id", membership.schoolId)
      .in("kind", ["undergraduate", "postgraduate"])
      .order("name");
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os cursos.");
    const programs = (data ?? []) as Row[];
    const { data: units } = programs.length
      ? await db
          .from("program_subjects")
          .select("program_id, credits")
          .eq("school_id", membership.schoolId)
          .eq("status", "active")
          .is("deleted_at", null)
          .in(
            "program_id",
            programs.map((p) => str(p.id)),
          )
      : { data: [] as Row[] };
    const totals = new Map<string, { units: number; credits: number }>();
    for (const unit of (units ?? []) as Row[]) {
      const current = totals.get(str(unit.program_id)) ?? { units: 0, credits: 0 };
      totals.set(str(unit.program_id), {
        units: current.units + 1,
        credits: current.credits + Number(unit.credits ?? 0),
      });
    }
    return programs.map((program) => ({
      id: str(program.id),
      code: str(program.code),
      name: str(program.name),
      kind: str(program.kind) as "undergraduate" | "postgraduate",
      active: Boolean(program.is_active),
      units: totals.get(str(program.id))?.units ?? 0,
      credits: totals.get(str(program.id))?.credits ?? 0,
    }));
  });

export const listSchoolSubjectsForPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("subjects")
      .select("id, code, name")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name");
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as cadeiras.");
    return (data ?? []).map((row) => ({
      id: str(row.id),
      code: str(row.code),
      name: str(row.name),
    }));
  });

export const getProgramPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ programId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    const program = await requireProgram(db, membership.schoolId, data.programId);
    const { units, prerequisites } = await loadPlan(db, membership.schoolId, data.programId);
    return {
      program: { id: str(program.id), name: str(program.name), code: str(program.code) },
      units,
      prerequisites,
      issues: validatePlan(units, prerequisites),
      totals: planTotals(units),
    };
  });

const planUnitInput = z.object({
  programId: z.string().uuid(),
  subjectId: z.string().uuid(),
  semester: z.number().int().min(1).max(14),
  credits: z.number().min(0.5).max(60),
});

export const savePlanUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    planUnitInput.extend({ id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    const db = await loadSgaAdminClient();
    await requireProgram(db, membership.schoolId, data.programId);
    const { data: subject } = await db
      .from("subjects")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.subjectId)
      .maybeSingle();
    if (!subject) throw new Error("Cadeira não encontrada nesta escola.");

    const { units } = await loadPlan(db, membership.schoolId, data.programId);
    const duplicate = units.find((u) => u.subjectId === data.subjectId && u.id !== data.id);
    if (duplicate) throw new Error("Esta cadeira já está no plano do curso.");

    if (data.id) {
      const { data: updated, error } = await db
        .from("program_subjects")
        .update({ semester: data.semester, credits: data.credits, updated_by: context.userId })
        .eq("school_id", membership.schoolId)
        .eq("program_id", data.programId)
        .eq("id", data.id)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error)
        throw publicDatabaseError(error, "Não foi possível actualizar a cadeira do plano.");
      if (!updated) throw new Error("Cadeira do plano não encontrada.");
      return { id: data.id };
    }
    const { data: created, error } = await db
      .from("program_subjects")
      .insert({
        school_id: membership.schoolId,
        program_id: data.programId,
        subject_id: data.subjectId,
        semester: data.semester,
        credits: data.credits,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível acrescentar a cadeira ao plano.");
    return { id: str(created.id) };
  });

export const removePlanUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ programId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    const db = await loadSgaAdminClient();
    // Com inscrições, a cadeira faz parte do histórico de estudantes: não sai do plano.
    const { count } = await db
      .from("course_unit_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId)
      .eq("program_subject_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(
        "Esta cadeira já tem inscrições de estudantes. Desactive-a em vez de a remover.",
      );
    }
    const { error: linksError } = await db
      .from("program_subject_prerequisites")
      .delete()
      .eq("school_id", membership.schoolId)
      .or(`program_subject_id.eq.${data.id},required_program_subject_id.eq.${data.id}`);
    if (linksError)
      throw publicDatabaseError(linksError, "Não foi possível remover as precedências.");
    const { error } = await db
      .from("program_subjects")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
      .eq("school_id", membership.schoolId)
      .eq("program_id", data.programId)
      .eq("id", data.id);
    if (error) throw publicDatabaseError(error, "Não foi possível remover a cadeira do plano.");
    return { ok: true };
  });

export const setUnitPrerequisites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        programId: z.string().uuid(),
        unitId: z.string().uuid(),
        requiredUnitIds: z.array(z.string().uuid()).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    const db = await loadSgaAdminClient();
    const { units, prerequisites } = await loadPlan(db, membership.schoolId, data.programId);
    const ids = new Set(units.map((u) => u.id));
    if (!ids.has(data.unitId)) throw new Error("Cadeira não encontrada no plano deste curso.");
    const required = [...new Set(data.requiredUnitIds)].filter((id) => id !== data.unitId);
    if (required.some((id) => !ids.has(id))) {
      throw new Error("Só pode escolher precedências do plano deste curso.");
    }
    const next: Prerequisite[] = [
      ...prerequisites.filter((p) => p.unitId !== data.unitId),
      ...required.map((id) => ({ unitId: data.unitId, requiresUnitId: id })),
    ];
    const cycles = findPrerequisiteCycles(units, next);
    if (cycles.length) {
      const names = new Map(units.map((u) => [u.id, u.name]));
      throw new Error(
        `Estas precedências criam um círculo: ${cycles[0]!.map((id) => names.get(id) ?? "?").join(" → ")}.`,
      );
    }
    const { error: deleteError } = await db
      .from("program_subject_prerequisites")
      .delete()
      .eq("school_id", membership.schoolId)
      .eq("program_subject_id", data.unitId);
    if (deleteError)
      throw publicDatabaseError(deleteError, "Não foi possível guardar as precedências.");
    if (required.length) {
      const { error } = await db.from("program_subject_prerequisites").insert(
        required.map((id) => ({
          school_id: membership.schoolId,
          program_subject_id: data.unitId,
          required_program_subject_id: id,
          created_by: context.userId,
        })),
      );
      if (error) throw publicDatabaseError(error, "Não foi possível guardar as precedências.");
    }
    return { ok: true, issues: validatePlan(units, next) };
  });

// ── Estudantes, inscrições e histórico ─────────────────────────────────────

export const listProgramStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ programId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    await requireProgram(db, membership.schoolId, data.programId);
    const { data: grades } = await db
      .from("grade_levels")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("program_id", data.programId);
    const gradeIds = (grades ?? []).map((g) => str(g.id));
    if (!gradeIds.length) return [];
    const yearId = await activeYearId(db, membership.schoolId);
    let groupsQuery = db
      .from("class_groups")
      .select("id, name")
      .eq("school_id", membership.schoolId)
      .in("grade_level_id", gradeIds);
    if (yearId) groupsQuery = groupsQuery.eq("academic_year_id", yearId);
    const { data: groups } = await groupsQuery;
    const groupName = new Map((groups ?? []).map((g) => [str(g.id), str(g.name)]));
    if (!groupName.size) return [];
    const { data: enrollments } = await db
      .from("enrollments")
      .select("student_id, class_group_id")
      .eq("school_id", membership.schoolId)
      .in("class_group_id", [...groupName.keys()])
      .in("status", ["active", "pending"])
      .limit(2000);
    const studentIds = [...new Set((enrollments ?? []).map((e) => str(e.student_id)))];
    if (!studentIds.length) return [];
    const { data: students } = await db
      .from("students")
      .select("id, person_id, student_number")
      .eq("school_id", membership.schoolId)
      .in("id", studentIds);
    const personIds = (students ?? []).map((s) => str(s.person_id));
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name")
          .eq("school_id", membership.schoolId)
          .in("id", personIds)
      : { data: [] as Row[] };
    const nameOf = new Map(((people ?? []) as Row[]).map((p) => [str(p.id), str(p.full_name)]));
    const groupOf = new Map(
      (enrollments ?? []).map((e) => [str(e.student_id), str(e.class_group_id)]),
    );
    return (students ?? [])
      .map((student) => ({
        id: str(student.id),
        name: nameOf.get(str(student.person_id)) || "Estudante",
        number: student.student_number ? str(student.student_number) : null,
        className: groupName.get(groupOf.get(str(student.id)) ?? "") ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  });

export const getStudentHigherEd = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ programId: z.string().uuid(), studentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    await requireProgram(db, schoolId, data.programId);
    await requireStudentInProgram(db, schoolId, data.studentId, data.programId);
    const [{ units, prerequisites }, rows, regulation, yearId] = await Promise.all([
      loadPlan(db, schoolId, data.programId),
      loadRecords(db, schoolId, data.studentId, data.programId),
      regulationOf(db, schoolId),
      activeYearId(db, schoolId),
    ]);
    const records = rows.map((row) => row.record);
    const latest = latestRecordByUnit(records);
    const rowIdByRecord = new Map(rows.map((row) => [row.record, row.id]));
    const progress = studentProgress({ plan: units, records, regulation });
    const unitsView = units.map((unit) => {
      const last = latest.get(unit.id) ?? null;
      const check = yearId
        ? checkEnrollmentBatch({
            selected: [unit],
            plan: units,
            prerequisites,
            records,
            regulation,
            academicYearId: yearId,
          }).perUnit.get(unit.id)
        : undefined;
      return {
        ...unit,
        latest: last ? { ...last, id: rowIdByRecord.get(last) ?? null } : null,
        canEnroll: Boolean(check?.ok),
        enrollReasons: check?.reasons ?? ["Não há ano lectivo activo."],
        seasons: seasonEligibility({ unitId: unit.id, records, plan: units, regulation }),
      };
    });
    return {
      activeYearId: yearId,
      regulation,
      progress: { ...progress, pendingUnits: progress.pendingUnits.map((u) => u.id) },
      units: unitsView,
      prerequisites,
    };
  });

export const enrollStudentUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        programId: z.string().uuid(),
        studentId: z.string().uuid(),
        unitIds: z.array(z.string().uuid()).min(1).max(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    await requireProgram(db, schoolId, data.programId);
    await requireStudentInProgram(db, schoolId, data.studentId, data.programId);
    const yearId = await activeYearId(db, schoolId);
    if (!yearId) throw new Error("Não há ano lectivo activo para inscrever o estudante.");
    const [{ units, prerequisites }, rows, regulation] = await Promise.all([
      loadPlan(db, schoolId, data.programId),
      loadRecords(db, schoolId, data.studentId, data.programId),
      regulationOf(db, schoolId),
    ]);
    const records = rows.map((row) => row.record);
    const selected = [...new Set(data.unitIds)].map((id) => {
      const unit = units.find((u) => u.id === id);
      if (!unit) throw new Error("Uma das cadeiras não pertence ao plano deste curso.");
      return unit;
    });
    const batch = checkEnrollmentBatch({
      selected,
      plan: units,
      prerequisites,
      records,
      regulation,
      academicYearId: yearId,
    });
    if (!batch.ok) {
      const reasons = [
        ...batch.limits,
        ...[...batch.perUnit.values()].flatMap((check) => check.reasons),
      ];
      throw new Error(reasons.join(" "));
    }
    const attempts = new Map<string, number>();
    for (const record of records) {
      attempts.set(record.unitId, Math.max(attempts.get(record.unitId) ?? 0, record.attempt));
    }
    const { error } = await db.from("course_unit_enrollments").insert(
      selected.map((unit) => ({
        school_id: schoolId,
        student_id: data.studentId,
        academic_year_id: yearId,
        program_id: data.programId,
        program_subject_id: unit.id,
        semester: academicSemesterOf(unit.semester),
        credits: unit.credits,
        attempt: (attempts.get(unit.id) ?? 0) + 1,
        status: "inscrito",
        credits_earned: 0,
        created_by: context.userId,
        updated_by: context.userId,
      })),
    );
    if (error) throw publicDatabaseError(error, "Não foi possível inscrever o estudante.");
    return { enrolled: selected.length, credits: batch.yearCredits };
  });

export const cancelUnitEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ enrollmentId: z.string().uuid(), reason: z.string().trim().min(3).max(300) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    const db = await loadSgaAdminClient();
    // Só se anula uma inscrição ainda sem resultado.
    const { data: updated, error } = await db
      .from("course_unit_enrollments")
      .update({ status: "anulado", notes: data.reason, updated_by: context.userId })
      .eq("school_id", membership.schoolId)
      .eq("id", data.enrollmentId)
      .eq("status", "inscrito")
      .select("id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível anular a inscrição.");
    if (!updated) throw new Error("Só se anula uma inscrição ainda sem resultado.");
    await audit(db, {
      schoolId: membership.schoolId,
      actor: context.userId,
      action: "higher_ed.enrollment.cancelled",
      entityId: data.enrollmentId,
      metadata: { reason: data.reason },
    });
    return { ok: true };
  });

/** Creditação/equivalência: a cadeira fica concluída sem nota (não entra na média). */
export const grantUnitExemption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        programId: z.string().uuid(),
        studentId: z.string().uuid(),
        unitId: z.string().uuid(),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    requireAal2(context.claims, "Creditar uma cadeira");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    await requireStudentInProgram(db, schoolId, data.studentId, data.programId);
    const yearId = await activeYearId(db, schoolId);
    if (!yearId) throw new Error("Não há ano lectivo activo.");
    const { units } = await loadPlan(db, schoolId, data.programId);
    const unit = units.find((u) => u.id === data.unitId);
    if (!unit) throw new Error("Cadeira não encontrada no plano deste curso.");
    const rows = await loadRecords(db, schoolId, data.studentId, data.programId);
    if (
      rows.some(
        (row) =>
          row.record.unitId === unit.id &&
          (row.record.status === "aprovado" || row.record.status === "dispensado"),
      )
    ) {
      throw new Error("Esta cadeira já está concluída.");
    }
    const attempt =
      Math.max(0, ...rows.filter((r) => r.record.unitId === unit.id).map((r) => r.record.attempt)) +
      1;
    const { data: created, error } = await db
      .from("course_unit_enrollments")
      .insert({
        school_id: schoolId,
        student_id: data.studentId,
        academic_year_id: yearId,
        program_id: data.programId,
        program_subject_id: unit.id,
        semester: academicSemesterOf(unit.semester),
        credits: unit.credits,
        attempt,
        status: "dispensado",
        credits_earned: unit.credits,
        notes: data.reason,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível registar a creditação.");
    await audit(db, {
      schoolId,
      actor: context.userId,
      action: "higher_ed.unit.exempted",
      entityId: str(created.id),
      metadata: { student_id: data.studentId, unit_id: unit.id, reason: data.reason },
    });
    return { ok: true };
  });

// ── Lançamento por época ───────────────────────────────────────────────────

const resultInput = z.object({
  programId: z.string().uuid(),
  studentId: z.string().uuid(),
  unitId: z.string().uuid(),
  season: z.enum(EXAM_SEASONS),
  frequency: z.number().min(0).max(20).nullable().optional(),
  exam: z.number().min(0).max(20).nullable().optional(),
  absencePercent: z.number().min(0).max(100).nullable().optional(),
});

/** O professor que dá a cadeira (numa turma do curso) também lança. */
async function canLaunchUnit(
  db: Db,
  membership: { schoolId: string; appRole: string; allAppRoles?: string[] },
  userId: string,
  programId: string,
  subjectId: string,
) {
  const roles = membership.allAppRoles ?? [membership.appRole];
  if (roles.some((role) => (OFFICE as readonly string[]).includes(role))) return true;
  if (!roles.includes("Professor")) return false;
  const { data: teacher } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!teacher?.id) return false;
  const { data: grades } = await db
    .from("grade_levels")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("program_id", programId);
  const gradeIds = (grades ?? []).map((g) => str(g.id));
  if (!gradeIds.length) return false;
  const { data: groups } = await db
    .from("class_groups")
    .select("id")
    .eq("school_id", membership.schoolId)
    .in("grade_level_id", gradeIds);
  const groupIds = (groups ?? []).map((g) => str(g.id));
  if (!groupIds.length) return false;
  const { data: assignment } = await db
    .from("class_subjects")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("subject_id", subjectId)
    .eq("teacher_id", str(teacher.id))
    .in("class_group_id", groupIds)
    .limit(1)
    .maybeSingle();
  return Boolean(assignment);
}

export const recordUnitResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resultInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const [{ units }, rows, regulation] = await Promise.all([
      loadPlan(db, schoolId, data.programId),
      loadRecords(db, schoolId, data.studentId, data.programId),
      regulationOf(db, schoolId),
    ]);
    const unit = units.find((u) => u.id === data.unitId);
    if (!unit) throw new Error("Cadeira não encontrada no plano deste curso.");
    if (!(await canLaunchUnit(db, membership, context.userId, data.programId, unit.subjectId))) {
      throw new Error("Só a coordenação ou o professor desta cadeira lança as notas.");
    }
    const records = rows.map((row) => row.record);
    const unitRows = rows.filter((row) => row.record.unitId === unit.id);
    const latestRecord = latestRecordByUnit(records).get(unit.id);
    const latestRow = unitRows.find((row) => row.record === latestRecord);
    if (!latestRow || !latestRecord)
      throw new Error("O estudante não está inscrito nesta cadeira.");

    let patch: Row;
    if (data.season === "frequencia") {
      if (latestRecord.status !== "inscrito") {
        throw new Error("A frequência só se lança numa inscrição ainda em curso.");
      }
      const outcome = frequencyOutcome(data.frequency, data.absencePercent, regulation);
      if (outcome.kind === "sem_nota") throw new Error("Indique a média de frequência.");
      patch =
        outcome.kind === "excluido_faltas"
          ? {
              status: "excluido_faltas",
              season: "frequencia",
              final_grade: null,
              credits_earned: 0,
            }
          : outcome.kind === "excluido_frequencia"
            ? {
                status: "excluido_frequencia",
                season: "frequencia",
                final_grade: outcome.frequency,
                credits_earned: 0,
              }
            : outcome.kind === "dispensado_exame"
              ? {
                  status: "aprovado",
                  season: "frequencia",
                  final_grade: outcome.grade,
                  credits_earned: unit.credits,
                }
              : {
                  status: "inscrito",
                  season: "frequencia",
                  final_grade: outcome.frequency,
                  credits_earned: 0,
                };
    } else {
      const eligible = seasonEligibility({ unitId: unit.id, records, plan: units, regulation });
      const season = data.season;
      if (season === "normal") {
        if (!(latestRecord.status === "inscrito" && latestRecord.season === "frequencia")) {
          throw new Error("Lance primeiro a frequência: só os admitidos vão à época normal.");
        }
      } else if (!eligible[season]) {
        throw new Error(
          season === "recurso"
            ? "Só vai a recurso quem reprovou na época normal."
            : season === "especial"
              ? `A época especial é só para finalistas (até ${regulation.special_season_max_units} cadeiras em falta).`
              : "Melhoria só depois de aprovar a cadeira, uma vez, se o regulamento a permitir.",
        );
      }
      const frequency = season === "normal" ? latestRecord.finalGrade : null;
      const result = seasonResult({
        season,
        frequency,
        exam: data.exam,
        previousGrade: latestRecord.finalGrade,
        regulation,
      });
      if (result.finalGrade === null) throw new Error("Indique a nota do exame.");
      patch = {
        status: result.status,
        season,
        final_grade: result.finalGrade,
        credits_earned: result.status === "aprovado" ? unit.credits : 0,
      };
    }

    // Só grava se a inscrição não mudou desde que foi lida: dois lançamentos em
    // simultâneo não se sobrepõem em silêncio.
    let update = db
      .from("course_unit_enrollments")
      .update({ ...patch, updated_by: context.userId })
      .eq("school_id", schoolId)
      .eq("id", latestRow.id)
      .eq("status", latestRecord.status);
    update = latestRecord.season
      ? update.eq("season", latestRecord.season)
      : update.is("season", null);
    const { data: saved, error } = await update.select("id");
    if (error) throw publicDatabaseError(error, "Não foi possível lançar o resultado.");
    if (!saved?.length) {
      throw new Error("Esta inscrição mudou entretanto. Actualize a página e lance de novo.");
    }
    await audit(db, {
      schoolId,
      actor: context.userId,
      action: `higher_ed.result.${data.season}`,
      entityId: latestRow.id,
      metadata: {
        before: {
          status: latestRecord.status,
          season: latestRecord.season,
          final_grade: latestRecord.finalGrade,
        },
        after: patch,
        inputs: {
          frequency: data.frequency ?? null,
          exam: data.exam ?? null,
          absence: data.absencePercent ?? null,
        },
      },
    });
    return { status: str(patch.status), finalGrade: (patch.final_grade as number | null) ?? null };
  });

// ── Regulamento ────────────────────────────────────────────────────────────

export const getHigherEdRegulation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    const { data } = await db
      .from("school_settings")
      .select("id, value")
      .eq("school_id", membership.schoolId)
      .eq("domain", "higher_ed")
      .maybeSingle();
    return {
      regulation: parseSettingsDomain("higher_ed", data?.value),
      configured: Boolean(data?.id),
      defaults: HIGHER_ED_DEFAULTS,
    };
  });

export const saveHigherEdRegulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.record(z.string(), z.unknown()).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const value = parseSettingsDomain("higher_ed", data);
    const { data: existing } = await db
      .from("school_settings")
      .select("id, version")
      .eq("school_id", membership.schoolId)
      .eq("domain", "higher_ed")
      .maybeSingle();
    const { error } = existing?.id
      ? await db
          .from("school_settings")
          .update({ value, version: Number(existing.version ?? 1) + 1, changed_by: context.userId })
          .eq("id", existing.id)
          .eq("school_id", membership.schoolId)
      : await db.from("school_settings").insert({
          school_id: membership.schoolId,
          domain: "higher_ed",
          version: 1,
          value,
          changed_by: context.userId,
        });
    if (error) throw publicDatabaseError(error, "Não foi possível guardar o regulamento.");
    return { regulation: value };
  });
