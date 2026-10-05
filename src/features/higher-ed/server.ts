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
  resolveSgaMembershipAdmin,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import {
  HIGHER_ED_DEFAULTS,
  parseProgramProfile,
  updateSettingsDomainValue,
  parseSettingsDomain,
  readSettingsDomain,
  type HigherEdRegulation,
} from "@/features/school/settings-domains";
import { requireAal2 } from "@/features/hr/require-aal2";
import { dynamicTablesClient } from "@/integrations/supabase/sga";
import {
  ISSUED_DOCUMENT_ACTION,
  generateVerificationCode,
} from "@/features/documents/verification";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import {
  HIGHER_ED_LEVEL,
  higherEdProgramCode,
  normalizeProgramCode,
  programYears,
} from "./program-shape";
import { HIGHER_ED_FEES } from "./fees";
import { rankAccessCandidates } from "./access";
import {
  completedUnitIds,
  decodeJuryDecision,
  encodeJuryDecision,
  finalClassification,
  academicStanding,
  cancellationIsLate,
  enrollmentWindowError,
  enrollmentOffer,
  academicSemesterOf,
  checkEnrollmentBatch,
  EXAM_SEASONS,
  findPrerequisiteCycles,
  frequencyOutcome,
  latestRecordByUnit,
  planCohortEnrollment,
  planTotals,
  seasonEligibility,
  seasonResult,
  studentProgress,
  transcriptLines,
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

const RECORD_COLUMNS =
  "id, student_id, program_subject_id, academic_year_id, semester, credits, attempt, status, final_grade, season, credits_earned, updated_at";

function toRecord(row: Row): UnitRecord {
  return {
    unitId: str(row.program_subject_id),
    academicYearId: str(row.academic_year_id),
    attempt: Number(row.attempt ?? 1),
    status: str(row.status) as EnrollmentStatus,
    season: (row.season ? str(row.season) : null) as ExamSeason | null,
    finalGrade: row.final_grade == null ? null : Number(row.final_grade),
    credits: Number(row.credits ?? 0),
    creditsEarned: Number(row.credits_earned ?? 0),
    updatedAt: str(row.updated_at),
  } as UnitRecord;
}

async function loadRecords(db: Db, schoolId: string, studentId: string, programId: string) {
  const { data, error } = await db
    .from("course_unit_enrollments")
    .select(RECORD_COLUMNS)
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("program_id", programId);
  if (error)
    throw publicDatabaseError(error, "Não foi possível carregar o histórico do estudante.");
  return ((data ?? []) as Row[]).map((row) => ({ id: str(row.id), record: toRecord(row) }));
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
  entry: {
    schoolId: string;
    actor: string;
    action: string;
    entityId: string;
    metadata: Row;
    entityType?: string;
  },
) {
  await db.from("audit_logs").insert({
    school_id: entry.schoolId,
    actor_user_id: entry.actor,
    action: entry.action,
    entity_type: entry.entityType ?? "course_unit_enrollment",
    entity_id: entry.entityId,
    metadata: entry.metadata as never,
  });
}

// ── Estatutos especiais (trabalhador-estudante) ─────────────────────────────

const WORKER_STUDENT = "trabalhador_estudante";
const MISSING_STATUS_TABLE =
  "O estatuto de trabalhador-estudante ainda não está disponível nesta base: falta aplicar docs/agents/SIGA_aplicar_trabalhador_estudante.sql.";

/** A tabela ainda não existe (migração 20261004150000 por aplicar). */
function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /does not exist|schema cache/i.test(error.message ?? "")),
  );
}

type WorkerStudentRow = {
  studentId: string;
  academicYearId: string;
  evidence: string;
  grantedAt: string;
};

/** Estatutos activos destes estudantes; vazio enquanto a tabela não existir. */
async function workerStudentRows(
  db: Db,
  schoolId: string,
  studentIds: string[],
): Promise<WorkerStudentRow[]> {
  if (!studentIds.length) return [];
  const { data, error } = await dynamicTablesClient(db)
    .from("higher_ed_student_statuses")
    .select("student_id, academic_year_id, evidence, granted_at")
    .eq("school_id", schoolId)
    .eq("status", WORKER_STUDENT)
    .is("revoked_at", null)
    .in("student_id", studentIds);
  if (error) {
    if (isMissingTable(error)) return [];
    throw publicDatabaseError(error, "Não foi possível ler o estatuto dos estudantes.");
  }
  return ((data ?? []) as Row[]).map((row) => ({
    studentId: str(row.student_id),
    academicYearId: str(row.academic_year_id),
    evidence: str(row.evidence),
    grantedAt: str(row.granted_at),
  }));
}

/** Trabalhador-estudante neste ano lectivo (o da inscrição, ou o activo). */
function isWorkerStudent(
  rows: WorkerStudentRow[],
  studentId: string,
  academicYearId: string | null | undefined,
) {
  return Boolean(
    academicYearId &&
    rows.some((row) => row.studentId === studentId && row.academicYearId === academicYearId),
  );
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
    const { data: years } = programs.length
      ? await db
          .from("grade_levels")
          .select("program_id")
          .eq("school_id", membership.schoolId)
          .in(
            "program_id",
            programs.map((p) => str(p.id)),
          )
      : { data: [] as Row[] };
    const yearCount = new Map<string, number>();
    for (const row of (years ?? []) as Row[]) {
      yearCount.set(str(row.program_id), (yearCount.get(str(row.program_id)) ?? 0) + 1);
    }
    const totals = new Map<string, { units: number; credits: number }>();
    for (const unit of (units ?? []) as Row[]) {
      const current = totals.get(str(unit.program_id)) ?? { units: 0, credits: 0 };
      totals.set(str(unit.program_id), {
        units: current.units + 1,
        credits: current.credits + Number(unit.credits ?? 0),
      });
    }
    const profiles = await readSettingsDomain(db, membership.schoolId, "higher_ed_programs");
    return programs.map((program) => ({
      profile: parseProgramProfile(profiles[str(program.id)]),
      id: str(program.id),
      code: str(program.code),
      name: str(program.name),
      kind: str(program.kind) as "undergraduate" | "postgraduate",
      active: Boolean(program.is_active),
      units: totals.get(str(program.id))?.units ?? 0,
      credits: totals.get(str(program.id))?.credits ?? 0,
      years: yearCount.get(str(program.id)) ?? 0,
    }));
  });

const profileInput = z.object({
  degree: z.enum(["licenciatura", "mestrado", "doutoramento", "especializacao"]),
  modality: z.enum(["presencial", "semipresencial", "distancia"]),
  regime: z.enum(["regular", "pos_laboral"]),
  seats: z.number().int().min(0).max(100_000),
});

const programInput = z.object({
  name: z.string().trim().min(3, "Indique o nome do curso.").max(120),
  code: z.string().trim().max(16).optional(),
  kind: z.enum(["undergraduate", "postgraduate"]),
  years: z.number().int().min(1).max(7),
  profile: profileInput.optional(),
});

/** Grau ↔ tipo do curso na base: só a licenciatura é graduação. */
const kindForDegree = (degree: z.infer<typeof profileInput>["degree"]) =>
  degree === "licenciatura" ? ("undergraduate" as const) : ("postgraduate" as const);

async function saveProgramProfile(
  db: Db,
  schoolId: string,
  programId: string,
  profile: z.infer<typeof profileInput>,
  userId: string,
) {
  await updateSettingsDomainValue(
    db,
    schoolId,
    "higher_ed_programs",
    (current) => ({
      ...((current && typeof current === "object" ? current : {}) as Record<string, unknown>),
      [programId]: parseProgramProfile(profile),
    }),
    userId,
  );
}

/** Cursos são estrutura da instituição: só o Administrador os cria e altera. */
async function adminMembership(context: {
  supabase: Parameters<typeof requireSgaWriterFor>[1];
  userId: string;
}) {
  return requireSgaWriterForWrite("pedagogica", context.supabase, context.userId, [
    "Administrador",
  ]);
}

async function ensureHigherLevel(db: Db, schoolId: string) {
  const { data: existing } = await db
    .from("academic_levels")
    .select("id")
    .eq("school_id", schoolId)
    .eq("code", HIGHER_ED_LEVEL.code)
    .maybeSingle();
  if (existing?.id) return str(existing.id);
  const { data, error } = await db
    .from("academic_levels")
    .insert({ school_id: schoolId, ...HIGHER_ED_LEVEL, is_active: true })
    .select("id")
    .single();
  if (error) throw publicDatabaseError(error, "Não foi possível criar o nível Ensino Superior.");
  return str(data.id);
}

/** Acrescenta os anos curriculares em falta (nunca apaga: podem ter turmas). */
async function ensureProgramYears(
  db: Db,
  schoolId: string,
  programId: string,
  code: string,
  years: number,
) {
  const wanted = programYears(code, years);
  // Os códigos dos anos repetem-se entre cursos («1ANO»): só os deste curso contam.
  const { data: existing } = await db
    .from("grade_levels")
    .select("code")
    .eq("school_id", schoolId)
    .eq("program_id", programId)
    .in(
      "code",
      wanted.map((grade) => grade.code),
    );
  const have = new Set((existing ?? []).map((row) => str(row.code)));
  const missing = wanted.filter((grade) => !have.has(grade.code));
  if (!missing.length) return 0;
  const { error } = await db.from("grade_levels").insert(
    missing.map((grade) => ({
      school_id: schoolId,
      program_id: programId,
      ...grade,
      is_active: true,
    })),
  );
  if (error) throw publicDatabaseError(error, "Não foi possível criar os anos do curso.");
  return missing.length;
}

export const createHigherEdProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => programInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await adminMembership(context);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const code = higherEdProgramCode(data.code || data.name);
    if (code.length < 5) throw new Error("Indique um código com pelo menos 2 letras.");
    const { data: clash } = await db
      .from("programs")
      .select("id")
      .eq("school_id", schoolId)
      .eq("code", code)
      .maybeSingle();
    if (clash) throw new Error(`Já existe um curso com o código ${code}.`);
    const levelId = await ensureHigherLevel(db, schoolId);
    const { data: program, error } = await db
      .from("programs")
      .insert({
        school_id: schoolId,
        academic_level_id: levelId,
        code,
        name: data.name,
        kind: data.profile ? kindForDegree(data.profile.degree) : data.kind,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o curso.");
    const programId = str(program.id);
    if (data.profile)
      await saveProgramProfile(db, schoolId, programId, data.profile, context.userId);
    try {
      await ensureProgramYears(db, schoolId, programId, code, data.years);
    } catch (yearsError) {
      // Sem anos o curso não serve: desfaz para não deixar um curso a meio.
      await db.from("programs").delete().eq("school_id", schoolId).eq("id", programId);
      throw yearsError;
    }
    await db.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      action: "higher_ed.program.created",
      entity_type: "program",
      entity_id: programId,
      metadata: { code, name: data.name, kind: data.kind, years: data.years } as never,
    });
    return { id: programId, code };
  });

export const updateHigherEdProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        programId: z.string().uuid(),
        name: z.string().trim().min(3).max(120),
        active: z.boolean(),
        years: z.number().int().min(1).max(7),
        profile: profileInput.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await adminMembership(context);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const program = await requireProgram(db, schoolId, data.programId);
    if (!["undergraduate", "postgraduate"].includes(str(program.kind))) {
      throw new Error("Este curso não é do Ensino Superior.");
    }
    const { error } = await db
      .from("programs")
      .update({
        name: data.name,
        is_active: data.active,
        ...(data.profile ? { kind: kindForDegree(data.profile.degree) } : {}),
      })
      .eq("school_id", schoolId)
      .eq("id", data.programId);
    if (error) throw publicDatabaseError(error, "Não foi possível guardar o curso.");
    const added = await ensureProgramYears(
      db,
      schoolId,
      data.programId,
      str(program.code),
      data.years,
    );
    if (data.profile) {
      await saveProgramProfile(db, schoolId, data.programId, data.profile, context.userId);
    }
    await db.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      action: "higher_ed.program.updated",
      entity_type: "program",
      entity_id: data.programId,
      metadata: {
        before: { name: str(program.name) },
        after: { name: data.name, active: data.active, profile: data.profile ?? null },
        yearsAdded: added,
      } as never,
    });
    return { yearsAdded: added };
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
  // Decreto Presidencial 193/18: de 1 a 20 unidades de crédito por cadeira.
  credits: z.number().min(1).max(20),
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
    const statuses = await workerStudentRows(db, schoolId, [data.studentId]);
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
        seasons: seasonEligibility({
          unitId: unit.id,
          records,
          plan: units,
          regulation,
          workerStudent: isWorkerStudent(statuses, data.studentId, last?.academicYearId ?? yearId),
        }),
      };
    });
    const workerStudent = statuses.find((row) => yearId && row.academicYearId === yearId) ?? null;
    const profiles = await readSettingsDomain(db, schoolId, "higher_ed_programs");
    return {
      activeYearId: yearId,
      degree: parseProgramProfile(profiles[data.programId]).degree,
      regulation,
      standing: academicStanding({ plan: units, records, regulation }),
      progress: { ...progress, pendingUnits: progress.pendingUnits.map((u) => u.id) },
      units: unitsView,
      prerequisites,
      /** Estatuto de trabalhador-estudante no ano lectivo activo. */
      workerStudent: workerStudent
        ? { evidence: workerStudent.evidence, grantedAt: workerStudent.grantedAt }
        : null,
    };
  });

/** Histórico académico (documento): uma linha por cadeira do plano, com o ano em que a fez. */
/** Histórico do estudante num curso: o que o ecrã mostra e o que o certificado certifica. */
async function buildTranscript(
  db: Db,
  schoolId: string,
  data: { programId: string; studentId: string },
) {
  const program = await requireProgram(db, schoolId, data.programId);
  const { data: student } = await db
    .from("students")
    .select("id, person_id, student_number")
    .eq("school_id", schoolId)
    .eq("id", data.studentId)
    .maybeSingle();
  if (!student) throw new Error("Estudante não encontrado nesta escola.");
  const [{ units }, rows, regulation, personResult, schoolResult] = await Promise.all([
    loadPlan(db, schoolId, data.programId),
    loadRecords(db, schoolId, data.studentId, data.programId),
    regulationOf(db, schoolId),
    db
      .from("people")
      .select("full_name, national_id")
      .eq("school_id", schoolId)
      .eq("id", str(student.person_id))
      .maybeSingle(),
    db
      .from("schools")
      .select("name, commercial_name, nif, address, director_name, logo_url")
      .eq("id", schoolId)
      .maybeSingle(),
  ]);
  // Só há histórico de quem tem registos no curso (ou matrícula nele).
  if (!rows.length) await requireStudentInProgram(db, schoolId, data.studentId, data.programId);
  const records = rows.map((row) => row.record);
  const lines = transcriptLines(units, records);
  const programProfiles = await readSettingsDomain(db, schoolId, "higher_ed_programs");
  const { data: noteRows } = await db
    .from("course_unit_enrollments")
    .select("notes")
    .eq("school_id", schoolId)
    .eq("student_id", data.studentId)
    .eq("program_id", data.programId)
    .eq("status", "aprovado")
    .like("notes", "júri:%");
  const juryMention =
    ((noteRows ?? []) as Row[])
      .map((row) => decodeJuryDecision(row.notes ? str(row.notes) : null))
      .find(Boolean) ?? null;
  const yearIds = [...new Set(lines.map((l) => l.academicYearId).filter(Boolean))] as string[];
  const { data: years } = yearIds.length
    ? await db.from("academic_years").select("id, name").eq("school_id", schoolId).in("id", yearIds)
    : { data: [] as Row[] };
  const yearName = new Map(((years ?? []) as Row[]).map((y) => [str(y.id), str(y.name)]));
  const progress = studentProgress({ plan: units, records, regulation });
  const school = (schoolResult.data ?? {}) as Row;
  const person = (personResult.data ?? {}) as Row;
  return {
    school: {
      name: str(school.commercial_name) || str(school.name),
      nif: school.nif ? str(school.nif) : null,
      address: school.address ? str(school.address) : null,
      director: school.director_name ? str(school.director_name) : null,
      logoUrl: school.logo_url ? str(school.logo_url) : null,
    },
    program: {
      name: str(program.name),
      code: str(program.code),
      kind: str(program.kind),
      degree: parseProgramProfile(programProfiles[data.programId]).degree,
    },
    juryMention: juryMention,
    student: {
      name: str(person.full_name) || "Estudante",
      number: student.student_number ? str(student.student_number) : null,
      document: person.national_id ? str(person.national_id) : null,
    },
    lines: lines.map((line) => ({
      ...line,
      yearName: line.academicYearId ? (yearName.get(line.academicYearId) ?? null) : null,
    })),
    progress: { ...progress, pendingUnits: progress.pendingUnits.length },
    passingGrade: regulation.passing_grade,
    issuedAt: new Date().toISOString(),
    certificate: await findIssuedCertificate(db, schoolId, data.studentId, data.programId),
  };
}

export const getStudentTranscript = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ programId: z.string().uuid(), studentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    return buildTranscript(db, membership.schoolId, data);
  });

// ── Estatuto de trabalhador-estudante: atribuir e retirar ──────────────────

const workerStudentGrantInput = z.object({
  studentId: z.string().uuid(),
  /** Comprovativo (ex.: declaração da entidade empregadora, com data). */
  evidence: z.string().trim().min(3).max(500),
});

/** O ano lectivo activo e o estudante, ambos desta escola. */
async function workerStudentTarget(db: Db, schoolId: string, studentId: string) {
  const yearId = await activeYearId(db, schoolId);
  if (!yearId) throw new Error("Não há ano lectivo activo.");
  const { data: student } = await db
    .from("students")
    .select("id")
    .eq("school_id", schoolId)
    .eq("id", studentId)
    .maybeSingle();
  if (!student) throw new Error("Estudante não encontrado nesta escola.");
  return yearId;
}

/**
 * Atribui o estatuto de trabalhador-estudante no ano lectivo activo (Direcção ou
 * Secretaria, 2FA, com o comprovativo). Muda as regras de faltas e de época especial,
 * por isso fica na auditoria. Atribuir de novo actualiza o comprovativo.
 */
export const grantWorkerStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => workerStudentGrantInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    requireAal2(context.claims, "Atribuir o estatuto de trabalhador-estudante");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const yearId = await workerStudentTarget(db, schoolId, data.studentId);
    const table = dynamicTablesClient(db);
    const { data: existing, error: readError } = await table
      .from("higher_ed_student_statuses")
      .select("id")
      .eq("school_id", schoolId)
      .eq("student_id", data.studentId)
      .eq("academic_year_id", yearId)
      .eq("status", WORKER_STUDENT)
      .maybeSingle();
    if (readError) {
      if (isMissingTable(readError)) throw new Error(MISSING_STATUS_TABLE);
      throw publicDatabaseError(readError, "Não foi possível ler o estatuto do estudante.");
    }
    const values = {
      evidence: data.evidence,
      granted_by: context.userId,
      granted_at: new Date().toISOString(),
      revoked_at: null,
      revoked_by: null,
      revocation_reason: null,
    };
    const { error } = existing
      ? await table
          .from("higher_ed_student_statuses")
          .update(values)
          .eq("school_id", schoolId)
          .eq("id", str((existing as Row).id))
      : await table.from("higher_ed_student_statuses").insert({
          school_id: schoolId,
          student_id: data.studentId,
          academic_year_id: yearId,
          status: WORKER_STUDENT,
          ...values,
        });
    if (error) throw publicDatabaseError(error, "Não foi possível atribuir o estatuto.");
    await audit(db, {
      schoolId,
      actor: context.userId,
      action: "higher_ed.worker_student.granted",
      entityId: data.studentId,
      entityType: "student",
      metadata: { academic_year_id: yearId, evidence: data.evidence },
    });
    return { academicYearId: yearId };
  });

/** Retira o estatuto no ano lectivo activo, com o motivo. A linha fica, revogada. */
export const revokeWorkerStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ studentId: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    requireAal2(context.claims, "Retirar o estatuto de trabalhador-estudante");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const yearId = await workerStudentTarget(db, schoolId, data.studentId);
    const { data: revoked, error } = await dynamicTablesClient(db)
      .from("higher_ed_student_statuses")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
        revocation_reason: data.reason,
      })
      .eq("school_id", schoolId)
      .eq("student_id", data.studentId)
      .eq("academic_year_id", yearId)
      .eq("status", WORKER_STUDENT)
      .is("revoked_at", null)
      .select("id");
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_STATUS_TABLE);
      throw publicDatabaseError(error, "Não foi possível retirar o estatuto.");
    }
    if (!revoked?.length) throw new Error("O estudante não tem o estatuto neste ano lectivo.");
    await audit(db, {
      schoolId,
      actor: context.userId,
      action: "higher_ed.worker_student.revoked",
      entityId: data.studentId,
      entityType: "student",
      metadata: { academic_year_id: yearId, reason: data.reason },
    });
    return { academicYearId: yearId };
  });

// ── Certificado de conclusão (carta de curso) com registo e QR ──────────────

/** Modelo no registo de documentos emitidos (`audit_logs`, `documents.issued`). */
export const HIGHER_ED_CERTIFICATE_TEMPLATE = "certificado-conclusao-superior";

type IssuedCertificate = { number: string; code: string; issuedAt: string };

/**
 * O certificado já emitido para o estudante neste curso (o primeiro, se por alguma
 * corrida houver dois): a segunda impressão sai com o mesmo número e o mesmo código.
 */
async function findIssuedCertificate(
  db: Db,
  schoolId: string,
  studentId: string,
  programId: string,
): Promise<IssuedCertificate | null> {
  const { data, error } = await db
    .from("audit_logs")
    .select("metadata, occurred_at")
    .eq("school_id", schoolId)
    .eq("action", ISSUED_DOCUMENT_ACTION)
    .eq("metadata->>template", HIGHER_ED_CERTIFICATE_TEMPLATE)
    .eq("metadata->>student_id", studentId)
    .eq("metadata->>program_id", programId)
    .order("occurred_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível ler o registo de certificados.");
  if (!data) return null;
  const meta = (data.metadata ?? {}) as Row;
  return {
    number: str(meta.reference),
    code: str(meta.code),
    issuedAt: str(meta.issued_at) || str(data.occurred_at),
  };
}

/**
 * Emite o certificado de conclusão: número da série «certificate» da escola
 * (document_sequences, «CE-000001») e código de verificação para /verificar, no mesmo
 * registo que os outros documentos oficiais. Só a Direcção e a Secretaria, com 2FA, e
 * só para quem concluiu o curso. Repetir devolve o mesmo certificado.
 */
export const issueHigherEdCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ programId: z.string().uuid(), studentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<IssuedCertificate> => {
    const membership = await officeMembership(context, "write");
    requireAal2(context.claims, "Emitir o certificado de conclusão");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const transcript = await buildTranscript(db, schoolId, data);
    if (transcript.certificate) return transcript.certificate;

    const doctoral = transcript.program.degree === "doutoramento";
    const final = transcript.progress.completed
      ? finalClassification(transcript.progress.average)
      : null;
    if (!transcript.progress.completed || (doctoral ? !transcript.juryMention : !final)) {
      throw new Error(
        "O estudante ainda não concluiu o curso: o certificado não pode ser emitido.",
      );
    }

    const { data: number, error: numberError } = await db.rpc("next_document_number_service", {
      school_id: schoolId,
      document_type: "certificate",
      default_prefix: "CE",
    });
    if (numberError || !number) {
      throw publicDatabaseError(
        numberError ?? { message: "sem número" },
        "Não foi possível numerar o certificado.",
      );
    }
    // Duas emissões ao mesmo tempo: fica a primeira (o número gasto fica por usar).
    const raced = await findIssuedCertificate(db, schoolId, data.studentId, data.programId);
    if (raced) return raced;

    const roles: string[] = membership.allAppRoles ?? [membership.appRole];
    const issued: IssuedCertificate = {
      number: String(number),
      code: generateVerificationCode(),
      issuedAt: new Date().toISOString(),
    };
    // Sem este registo o documento diria que é verificável e não é: o erro não se engole.
    const { error } = await db.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      action: ISSUED_DOCUMENT_ACTION,
      entity_type: "issued_document",
      entity_id: crypto.randomUUID(),
      metadata: {
        code: issued.code,
        title: `Certificado de conclusão — ${transcript.program.name}`,
        holder: transcript.student.name,
        template: HIGHER_ED_CERTIFICATE_TEMPLATE,
        issuer_role: roles.includes("Administrador") ? "Administrador" : "Secretaria",
        reference: issued.number,
        school_name: transcript.school.name,
        issued_at: issued.issuedAt,
        student_id: data.studentId,
        program_id: data.programId,
        final_grade: final?.value ?? null,
        mention: doctoral ? transcript.juryMention : (final?.mention ?? null),
      } as never,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível registar o certificado emitido.");
    return issued;
  });

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Estudantes com propinas vencidas por pagar (para o bloqueio por dívida). */
async function studentsWithOverdueDebt(db: Db, schoolId: string, studentIds: string[]) {
  if (!studentIds.length) return new Set<string>();
  const { data: enrollments } = await db
    .from("enrollments")
    .select("id, student_id")
    .eq("school_id", schoolId)
    .in("student_id", studentIds);
  const studentOfEnrollment = new Map(
    (enrollments ?? []).map((row) => [str(row.id), str(row.student_id)]),
  );
  if (!studentOfEnrollment.size) return new Set<string>();
  const { data: contracts } = await db
    .from("finance_contracts")
    .select("id, enrollment_id")
    .eq("school_id", schoolId)
    .in("enrollment_id", [...studentOfEnrollment.keys()]);
  const studentOfContract = new Map(
    (contracts ?? []).map((row) => [
      str(row.id),
      studentOfEnrollment.get(str(row.enrollment_id)) ?? "",
    ]),
  );
  if (!studentOfContract.size) return new Set<string>();
  const { data: invoices } = await db
    .from("finance_invoices")
    .select("contract_id")
    .eq("school_id", schoolId)
    .in("contract_id", [...studentOfContract.keys()])
    .in("status", ["open", "partially_paid"])
    .lt("due_date", todayIso());
  return new Set(
    (invoices ?? [])
      .map((row) => studentOfContract.get(str(row.contract_id)) ?? "")
      .filter(Boolean),
  );
}

/** Regras opcionais do regulamento antes de qualquer inscrição em cadeiras. */
async function assertEnrollmentAllowed(
  db: Db,
  schoolId: string,
  regulation: HigherEdRegulation,
  studentIds: string[],
) {
  const windowError = enrollmentWindowError(regulation, todayIso());
  if (windowError) throw new Error(windowError);
  if (!regulation.block_enrollment_with_debt) return new Set<string>();
  return studentsWithOverdueDebt(db, schoolId, studentIds);
}

/**
 * Inscreve um estudante em cadeiras do ano activo com as regras do regulamento
 * (período, dívida, precedências, tentativas e créditos). Usada pela secretaria
 * e pela matrícula on-line do próprio estudante.
 */
async function enrollUnitsFor(
  db: Db,
  params: {
    schoolId: string;
    studentId: string;
    programId: string;
    unitIds: string[];
    actor: string;
    regulation: HigherEdRegulation;
  },
) {
  const { schoolId, studentId, programId, regulation } = params;
  await requireProgram(db, schoolId, programId);
  await requireStudentInProgram(db, schoolId, studentId, programId);
  const yearId = await activeYearId(db, schoolId);
  if (!yearId) throw new Error("Não há ano lectivo activo para inscrever o estudante.");
  const [{ units, prerequisites }, rows] = await Promise.all([
    loadPlan(db, schoolId, programId),
    loadRecords(db, schoolId, studentId, programId),
  ]);
  const indebted = await assertEnrollmentAllowed(db, schoolId, regulation, [studentId]);
  if (indebted.has(studentId)) {
    throw new Error(
      "O estudante tem propinas vencidas por pagar: o regulamento não permite a inscrição.",
    );
  }
  const records = rows.map((row) => row.record);
  const selected = [...new Set(params.unitIds)].map((id) => {
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
  const { data: inserted, error } = await db
    .from("course_unit_enrollments")
    .insert(
      selected.map((unit) => ({
        school_id: schoolId,
        student_id: studentId,
        academic_year_id: yearId,
        program_id: programId,
        program_subject_id: unit.id,
        semester: academicSemesterOf(unit.semester),
        credits: unit.credits,
        attempt: (attempts.get(unit.id) ?? 0) + 1,
        status: "inscrito",
        credits_earned: 0,
        created_by: params.actor,
        updated_by: params.actor,
      })),
    )
    .select("id");
  if (error) throw publicDatabaseError(error, "Não foi possível inscrever o estudante.");
  return {
    enrolled: selected.length,
    credits: batch.yearCredits,
    ids: ((inserted ?? []) as Row[]).map((row) => str(row.id)),
    units: selected.map((unit) => unit.name),
  };
}

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
    const regulation = await regulationOf(db, membership.schoolId);
    const result = await enrollUnitsFor(db, {
      schoolId: membership.schoolId,
      studentId: data.studentId,
      programId: data.programId,
      unitIds: data.unitIds,
      actor: context.userId,
      regulation,
    });
    return { enrolled: result.enrolled, credits: result.credits };
  });

/** Estudantes com matrícula activa (ou pendente) numa turma de um ano do curso. */
async function programStudentIds(db: Db, schoolId: string, programId: string) {
  const { data: grades } = await db
    .from("grade_levels")
    .select("id")
    .eq("school_id", schoolId)
    .eq("program_id", programId);
  const gradeIds = (grades ?? []).map((g) => str(g.id));
  if (!gradeIds.length) return new Set<string>();
  const { data: groups } = await db
    .from("class_groups")
    .select("id")
    .eq("school_id", schoolId)
    .in("grade_level_id", gradeIds);
  const groupIds = (groups ?? []).map((g) => str(g.id));
  if (!groupIds.length) return new Set<string>();
  const { data: enrollments } = await db
    .from("enrollments")
    .select("student_id")
    .eq("school_id", schoolId)
    .in("class_group_id", groupIds)
    .in("status", ["active", "pending"])
    .limit(5000);
  return new Set((enrollments ?? []).map((e) => str(e.student_id)));
}

/**
 * Inscrição em lote: cada estudante escolhido fica nas cadeiras do semestre que
 * pode fazer (mesmas regras da inscrição individual); o resto volta com motivo.
 */
export const enrollCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        programId: z.string().uuid(),
        semester: z.number().int().min(1).max(14),
        studentIds: z.array(z.string().uuid()).min(1).max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    await requireProgram(db, schoolId, data.programId);
    const yearId = await activeYearId(db, schoolId);
    if (!yearId) throw new Error("Não há ano lectivo activo para inscrever.");
    const studentIds = [...new Set(data.studentIds)];
    const inProgram = await programStudentIds(db, schoolId, data.programId);
    if (studentIds.some((id) => !inProgram.has(id))) {
      throw new Error("Há estudantes escolhidos que não estão matriculados neste curso.");
    }
    const [{ units, prerequisites }, regulation] = await Promise.all([
      loadPlan(db, schoolId, data.programId),
      regulationOf(db, schoolId),
    ]);
    const candidates = units.filter((unit) => unit.semester === data.semester);
    if (!candidates.length) throw new Error("O plano não tem cadeiras neste semestre.");
    const indebted = await assertEnrollmentAllowed(db, schoolId, regulation, studentIds);
    const { data: recordRows, error: recordsError } = await db
      .from("course_unit_enrollments")
      .select(RECORD_COLUMNS)
      .eq("school_id", schoolId)
      .eq("program_id", data.programId)
      .in("student_id", studentIds);
    if (recordsError)
      throw publicDatabaseError(recordsError, "Não foi possível carregar os históricos.");
    const recordsByStudent = new Map<string, UnitRecord[]>();
    for (const row of (recordRows ?? []) as Row[]) {
      const list = recordsByStudent.get(str(row.student_id)) ?? [];
      list.push(toRecord(row));
      recordsByStudent.set(str(row.student_id), list);
    }

    const inserts: Row[] = [];
    const skipped: Array<{ studentId: string; unit: string; reasons: string[] }> = [];
    let studentsEnrolled = 0;
    for (const studentId of studentIds) {
      if (indebted.has(studentId)) {
        skipped.push({
          studentId,
          unit: "todas",
          reasons: ["Propinas vencidas por pagar (regulamento)."],
        });
        continue;
      }
      const records = recordsByStudent.get(studentId) ?? [];
      const result = planCohortEnrollment({
        candidates,
        plan: units,
        prerequisites,
        records,
        regulation,
        academicYearId: yearId,
      });
      for (const item of result.skipped) {
        skipped.push({ studentId, unit: item.unit.name, reasons: item.reasons });
      }
      if (!result.selected.length) continue;
      studentsEnrolled += 1;
      for (const unit of result.selected) {
        const attempt = records
          .filter((record) => record.unitId === unit.id)
          .reduce((max, record) => Math.max(max, record.attempt), 0);
        inserts.push({
          school_id: schoolId,
          student_id: studentId,
          academic_year_id: yearId,
          program_id: data.programId,
          program_subject_id: unit.id,
          semester: academicSemesterOf(unit.semester),
          credits: unit.credits,
          attempt: attempt + 1,
          status: "inscrito",
          credits_earned: 0,
          created_by: context.userId,
          updated_by: context.userId,
        });
      }
    }
    if (inserts.length) {
      const { error } = await db
        .from("course_unit_enrollments")
        .insert(inserts.map((row) => ({ ...row, school_id: schoolId })) as never);
      if (error) throw publicDatabaseError(error, "Não foi possível inscrever os estudantes.");
      await db.from("audit_logs").insert({
        school_id: schoolId,
        actor_user_id: context.userId,
        action: "higher_ed.cohort.enrolled",
        entity_type: "program",
        entity_id: data.programId,
        metadata: {
          semester: data.semester,
          students: studentsEnrolled,
          enrollments: inserts.length,
          skipped: skipped.length,
        } as never,
      });
    }
    return { studentsEnrolled, enrollments: inserts.length, skipped };
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
    const regulation = await regulationOf(db, membership.schoolId);
    if (regulation.cancel_deadline_days > 0) {
      const { data: target } = await db
        .from("course_unit_enrollments")
        .select("academic_year_id, semester")
        .eq("school_id", membership.schoolId)
        .eq("id", data.enrollmentId)
        .maybeSingle();
      const { data: term } = target
        ? await db
            .from("terms")
            .select("starts_on")
            .eq("school_id", membership.schoolId)
            .eq("academic_year_id", str(target.academic_year_id))
            .eq("sequence", Number(target.semester ?? 1))
            .maybeSingle()
        : { data: null };
      if (
        cancellationIsLate(
          regulation.cancel_deadline_days,
          term?.starts_on ? str(term.starts_on) : null,
          todayIso(),
        )
      ) {
        requireAal2(context.claims, "Anular uma inscrição fora do prazo");
      }
    }
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

/**
 * Inscrições que ficaram sem resultado em anos lectivos anteriores: a
 * secretaria fecha-as (anula com motivo) antes de o estudante voltar a inscrever-se.
 */
export const listStalePendingEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ programId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    await requireProgram(db, schoolId, data.programId);
    const yearId = await activeYearId(db, schoolId);
    let query = db
      .from("course_unit_enrollments")
      .select("id, student_id, program_subject_id, academic_year_id, season, final_grade")
      .eq("school_id", schoolId)
      .eq("program_id", data.programId)
      .eq("status", "inscrito")
      .limit(500);
    if (yearId) query = query.neq("academic_year_id", yearId);
    const { data: rows, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as inscrições.");
    const list = (rows ?? []) as Row[];
    if (!list.length) return [];
    const unique = (key: string) => [...new Set(list.map((row) => str(row[key])))];
    const [{ data: students }, { data: years }, { units }] = await Promise.all([
      db
        .from("students")
        .select("id, person_id, student_number")
        .eq("school_id", schoolId)
        .in("id", unique("student_id")),
      db
        .from("academic_years")
        .select("id, name")
        .eq("school_id", schoolId)
        .in("id", unique("academic_year_id")),
      loadPlan(db, schoolId, data.programId),
    ]);
    const personIds = (students ?? []).map((s) => str(s.person_id));
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name")
          .eq("school_id", schoolId)
          .in("id", personIds)
      : { data: [] as Row[] };
    const personName = new Map(((people ?? []) as Row[]).map((p) => [str(p.id), str(p.full_name)]));
    const studentName = new Map(
      (students ?? []).map((s) => [str(s.id), personName.get(str(s.person_id)) || "Estudante"]),
    );
    const yearName = new Map(((years ?? []) as Row[]).map((y) => [str(y.id), str(y.name)]));
    const unitName = new Map(units.map((u) => [u.id, u.name]));
    return list
      .map((row) => ({
        id: str(row.id),
        studentName: studentName.get(str(row.student_id)) ?? "Estudante",
        unitName: unitName.get(str(row.program_subject_id)) ?? "Cadeira",
        yearName: yearName.get(str(row.academic_year_id)) ?? "Ano anterior",
        admitted: row.season === "frequencia",
      }))
      .sort(
        (a, b) =>
          a.yearName.localeCompare(b.yearName, "pt") ||
          a.studentName.localeCompare(b.studentName, "pt"),
      );
  });

/**
 * Correcção de um resultado já lançado (erro de lançamento): só a coordenação,
 * com 2FA e motivo; o estado volta a sair da nota e do regulamento, e fica a
 * nota anterior na auditoria. Não muda a época nem cria tentativa nova.
 */
export const correctUnitResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        enrollmentId: z.string().uuid(),
        finalGrade: z.number().min(0).max(20),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    requireAal2(context.claims, "Corrigir uma nota lançada");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: row, error: readError } = await db
      .from("course_unit_enrollments")
      .select("id, status, season, final_grade, credits")
      .eq("school_id", schoolId)
      .eq("id", data.enrollmentId)
      .maybeSingle();
    if (readError) throw publicDatabaseError(readError, "Não foi possível ler o resultado.");
    if (!row) throw new Error("Inscrição não encontrada nesta escola.");
    const status = str(row.status);
    if (!["aprovado", "reprovado", "excluido_frequencia"].includes(status) || !row.season) {
      throw new Error("Só se corrige um resultado já lançado (aprovado ou reprovado).");
    }
    const regulation = await regulationOf(db, schoolId);
    const grade = Math.round(data.finalGrade * 10) / 10;
    const approved = grade >= regulation.passing_grade;
    const patch = {
      final_grade: grade,
      status: approved ? "aprovado" : "reprovado",
      credits_earned: approved ? Number(row.credits ?? 0) : 0,
      updated_by: context.userId,
    };
    let update = db
      .from("course_unit_enrollments")
      .update(patch)
      .eq("school_id", schoolId)
      .eq("id", data.enrollmentId)
      .eq("status", status);
    update =
      row.final_grade == null
        ? update.is("final_grade", null)
        : update.eq("final_grade", row.final_grade);
    const { data: saved, error } = await update.select("id");
    if (error) throw publicDatabaseError(error, "Não foi possível corrigir o resultado.");
    if (!saved?.length) {
      throw new Error("Este resultado mudou entretanto. Actualize a página e tente de novo.");
    }
    await audit(db, {
      schoolId,
      actor: context.userId,
      action: "higher_ed.result.corrected",
      entityId: data.enrollmentId,
      metadata: {
        reason: data.reason,
        before: { status, final_grade: row.final_grade },
        after: { status: patch.status, final_grade: grade },
      },
    });
    return { status: patch.status, finalGrade: grade };
  });

/**
 * Decisão do júri de doutoramento sobre a tese (uma cadeira do plano): conclui a
 * cadeira sem nota numérica e grava a menção. Secretaria, 2FA e auditoria.
 */
export const recordDoctoralDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        programId: z.string().uuid(),
        studentId: z.string().uuid(),
        unitId: z.string().uuid(),
        mention: z.enum(["aprovado", "distincao", "distincao_louvor"]),
        note: z.string().trim().min(5).max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    requireAal2(context.claims, "Registar a decisão do júri");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const profiles = await readSettingsDomain(db, schoolId, "higher_ed_programs");
    if (parseProgramProfile(profiles[data.programId]).degree !== "doutoramento") {
      throw new Error("A decisão do júri só se regista em cursos de doutoramento.");
    }
    const rows = await loadRecords(db, schoolId, data.studentId, data.programId);
    const latest = latestRecordByUnit(rows.map((row) => row.record)).get(data.unitId);
    const row = rows.find((r) => r.record === latest);
    if (!row || !latest || latest.status !== "inscrito") {
      throw new Error("O estudante tem de estar inscrito na tese, sem resultado lançado.");
    }
    const { data: saved, error } = await db
      .from("course_unit_enrollments")
      .update({
        status: "aprovado",
        season: "normal",
        final_grade: null,
        credits_earned: latest.credits,
        notes: encodeJuryDecision(data.mention, data.note),
        updated_by: context.userId,
      })
      .eq("school_id", schoolId)
      .eq("id", row.id)
      .eq("status", "inscrito")
      .select("id");
    if (error) throw publicDatabaseError(error, "Não foi possível registar a decisão do júri.");
    if (!saved?.length) throw new Error("A inscrição mudou entretanto. Actualize a página.");
    await audit(db, {
      schoolId,
      actor: context.userId,
      action: "higher_ed.doctoral.decision",
      entityId: row.id,
      metadata: { mention: data.mention, note: data.note },
    });
    return { mention: data.mention };
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
    // Estatuto no ano lectivo da inscrição: faltas e época especial (regulamento).
    const workerStudent = isWorkerStudent(
      await workerStudentRows(db, schoolId, [data.studentId]),
      data.studentId,
      latestRecord.academicYearId,
    );

    let patch: Row;
    if (data.season === "frequencia") {
      if (latestRecord.status !== "inscrito") {
        throw new Error("A frequência só se lança numa inscrição ainda em curso.");
      }
      const outcome = frequencyOutcome(data.frequency, data.absencePercent, regulation, {
        workerStudent,
      });
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
      const eligible = seasonEligibility({
        unitId: unit.id,
        records,
        plan: units,
        regulation,
        workerStudent,
      });
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
              ? `A época especial é só para finalistas (até ${regulation.special_season_max_units} cadeiras em falta)${regulation.worker_student_special_season ? " e trabalhadores-estudantes" : ""}.`
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

// ── Pauta da cadeira (professor e secretaria) ──────────────────────────────

const LAUNCHERS = ["Administrador", "Secretaria", "Professor"] as const;

function isOfficeRole(membership: { appRole: string; allAppRoles?: string[] }) {
  const roles = membership.allAppRoles ?? [membership.appRole];
  return roles.some((role) => (OFFICE as readonly string[]).includes(role));
}

/** Pares curso:disciplina que o professor dá numa turma do curso. */
async function teacherUnitKeys(db: Db, schoolId: string, userId: string) {
  const keys = new Set<string>();
  const { data: teacher } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!teacher?.id) return keys;
  const { data: assignments } = await db
    .from("class_subjects")
    .select("class_group_id, subject_id")
    .eq("school_id", schoolId)
    .eq("teacher_id", str(teacher.id));
  const groupIds = [...new Set((assignments ?? []).map((a) => str(a.class_group_id)))];
  if (!groupIds.length) return keys;
  const { data: groups } = await db
    .from("class_groups")
    .select("id, grade_level_id")
    .eq("school_id", schoolId)
    .in("id", groupIds);
  const gradeIds = [...new Set((groups ?? []).map((g) => str(g.grade_level_id)))];
  const { data: grades } = gradeIds.length
    ? await db
        .from("grade_levels")
        .select("id, program_id")
        .eq("school_id", schoolId)
        .in("id", gradeIds)
    : { data: [] as Row[] };
  const programOfGrade = new Map(
    ((grades ?? []) as Row[]).map((g) => [str(g.id), str(g.program_id)]),
  );
  const programOfGroup = new Map(
    (groups ?? []).map((g) => [str(g.id), programOfGrade.get(str(g.grade_level_id)) ?? ""]),
  );
  for (const assignment of assignments ?? []) {
    const programId = programOfGroup.get(str(assignment.class_group_id));
    if (programId) keys.add(`${programId}:${str(assignment.subject_id)}`);
  }
  return keys;
}

/** Cadeiras em que a pessoa pode lançar: todas (secretaria) ou as suas (professor). */
export const listLaunchableUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...LAUNCHERS,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: programs, error } = await db
      .from("programs")
      .select("id, name")
      .eq("school_id", schoolId)
      .in("kind", ["undergraduate", "postgraduate"])
      .order("name");
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os cursos.");
    if (!programs?.length) return [];
    const programName = new Map(programs.map((p) => [str(p.id), str(p.name)]));
    const { data: rows, error: unitsError } = await db
      .from("program_subjects")
      .select("id, program_id, subject_id, semester, credits")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .is("deleted_at", null)
      .in("program_id", [...programName.keys()]);
    if (unitsError) throw publicDatabaseError(unitsError, "Não foi possível carregar as cadeiras.");
    const allowed = isOfficeRole(membership)
      ? null
      : await teacherUnitKeys(db, schoolId, context.userId);
    const visible = ((rows ?? []) as Row[]).filter(
      (row) => !allowed || allowed.has(`${str(row.program_id)}:${str(row.subject_id)}`),
    );
    const subjectIds = [...new Set(visible.map((row) => str(row.subject_id)))];
    const { data: subjects } = subjectIds.length
      ? await db.from("subjects").select("id, name").eq("school_id", schoolId).in("id", subjectIds)
      : { data: [] as Row[] };
    const subjectName = new Map(((subjects ?? []) as Row[]).map((s) => [str(s.id), str(s.name)]));
    return visible
      .map((row) => ({
        programId: str(row.program_id),
        programName: programName.get(str(row.program_id)) ?? "Curso",
        unitId: str(row.id),
        name: subjectName.get(str(row.subject_id)) || "Cadeira",
        semester: Number(row.semester),
        credits: Number(row.credits),
      }))
      .sort(
        (a, b) =>
          a.programName.localeCompare(b.programName, "pt") ||
          a.semester - b.semester ||
          a.name.localeCompare(b.name, "pt"),
      );
  });

/**
 * Pauta de uma cadeira: os estudantes inscritos, o último resultado de cada um
 * e as épocas a que vai — calculadas pelo mesmo motor que valida o lançamento.
 */
export const getUnitSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ programId: z.string().uuid(), unitId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...LAUNCHERS,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const program = await requireProgram(db, schoolId, data.programId);
    const [{ units }, regulation] = await Promise.all([
      loadPlan(db, schoolId, data.programId),
      regulationOf(db, schoolId),
    ]);
    const unit = units.find((u) => u.id === data.unitId);
    if (!unit) throw new Error("Cadeira não encontrada no plano deste curso.");
    if (!(await canLaunchUnit(db, membership, context.userId, data.programId, unit.subjectId))) {
      throw new Error("Só a coordenação ou o professor desta cadeira vê esta pauta.");
    }
    const { data: inUnit, error: inUnitError } = await db
      .from("course_unit_enrollments")
      .select("student_id")
      .eq("school_id", schoolId)
      .eq("program_id", data.programId)
      .eq("program_subject_id", unit.id)
      .limit(5000);
    if (inUnitError) throw publicDatabaseError(inUnitError, "Não foi possível carregar a pauta.");
    const studentIds = [...new Set((inUnit ?? []).map((row) => str(row.student_id)))];
    const yearId = await activeYearId(db, schoolId);
    const [{ data: school }, { data: year }] = await Promise.all([
      db.from("schools").select("name, commercial_name, logo_url").eq("id", schoolId).maybeSingle(),
      yearId
        ? db
            .from("academic_years")
            .select("name")
            .eq("school_id", schoolId)
            .eq("id", yearId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const base = {
      program: { id: str(program.id), name: str(program.name) },
      unit,
      regulation,
      school: {
        name: str(school?.commercial_name) || str(school?.name),
        logoUrl: school?.logo_url ? str(school.logo_url) : null,
      },
      yearName: year?.name ? str(year.name) : null,
    };
    if (!studentIds.length) return { ...base, rows: [] };

    // O histórico completo de cada estudante no curso: a época especial depende
    // de quantas cadeiras lhe faltam no plano, não só desta.
    const { data: recordRows, error } = await db
      .from("course_unit_enrollments")
      .select(RECORD_COLUMNS)
      .eq("school_id", schoolId)
      .eq("program_id", data.programId)
      .in("student_id", studentIds);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar a pauta.");
    const byStudent = new Map<string, UnitRecord[]>();
    for (const row of (recordRows ?? []) as Row[]) {
      const list = byStudent.get(str(row.student_id)) ?? [];
      list.push(toRecord(row));
      byStudent.set(str(row.student_id), list);
    }
    const { data: students } = await db
      .from("students")
      .select("id, person_id, student_number")
      .eq("school_id", schoolId)
      .in("id", studentIds);
    const personIds = (students ?? []).map((s) => str(s.person_id));
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name")
          .eq("school_id", schoolId)
          .in("id", personIds)
      : { data: [] as Row[] };
    const nameOf = new Map(((people ?? []) as Row[]).map((p) => [str(p.id), str(p.full_name)]));
    const statuses = await workerStudentRows(db, schoolId, studentIds);

    const rows = (students ?? [])
      .map((student) => {
        const records = byStudent.get(str(student.id)) ?? [];
        const latest = latestRecordByUnit(records).get(unit.id) ?? null;
        const workerStudent = isWorkerStudent(
          statuses,
          str(student.id),
          latest?.academicYearId ?? yearId,
        );
        const eligible = seasonEligibility({
          unitId: unit.id,
          records,
          plan: units,
          regulation,
          workerStudent,
        });
        return {
          studentId: str(student.id),
          name: nameOf.get(str(student.person_id)) || "Estudante",
          number: student.student_number ? str(student.student_number) : null,
          workerStudent,
          latest: latest
            ? {
                status: latest.status,
                season: latest.season,
                finalGrade: latest.finalGrade,
                attempt: latest.attempt,
              }
            : null,
          seasons: {
            frequencia: latest?.status === "inscrito",
            normal: eligible.normal,
            recurso: eligible.recurso,
            especial: eligible.especial,
            melhoria: eligible.melhoria,
          } satisfies Record<ExamSeason, boolean>,
        };
      })
      .filter((row) => row.latest && row.latest.status !== "anulado")
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
    return { ...base, rows };
  });

// ── Portal do estudante e do encarregado ───────────────────────────────────

/**
 * O percurso no Ensino Superior do próprio estudante (ou do educando): créditos,
 * média e o estado de cada cadeira do plano. Só leitura; vazio para quem não
 * tem curso superior.
 */
export const getMyHigherEd = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ studentId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const visible = await resolveVisibleStudent(context.userId, data.studentId);
    if (!visible) return { programs: [] };
    const { db, schoolId, studentId } = visible;

    const { data: recordPrograms } = await db
      .from("course_unit_enrollments")
      .select("program_id")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .limit(1000);
    const { data: enrollments } = await db
      .from("enrollments")
      .select("class_group_id")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .in("status", ["active", "pending"]);
    const groupIds = [...new Set((enrollments ?? []).map((e) => str(e.class_group_id)))];
    const { data: groups } = groupIds.length
      ? await db
          .from("class_groups")
          .select("grade_level_id")
          .eq("school_id", schoolId)
          .in("id", groupIds)
      : { data: [] as Row[] };
    const gradeIds = [...new Set(((groups ?? []) as Row[]).map((g) => str(g.grade_level_id)))];
    const { data: grades } = gradeIds.length
      ? await db
          .from("grade_levels")
          .select("program_id")
          .eq("school_id", schoolId)
          .in("id", gradeIds)
      : { data: [] as Row[] };
    const candidateIds = [
      ...new Set(
        [...(recordPrograms ?? []), ...((grades ?? []) as Row[])]
          .map((row) => str(row.program_id))
          .filter(Boolean),
      ),
    ];
    if (!candidateIds.length) return { programs: [] };
    const { data: programs } = await db
      .from("programs")
      .select("id, name")
      .eq("school_id", schoolId)
      .in("kind", ["undergraduate", "postgraduate"])
      .in("id", candidateIds)
      .order("name");
    if (!programs?.length) return { programs: [] };

    const regulation = await regulationOf(db, schoolId);
    const result = [];
    for (const program of programs) {
      const programId = str(program.id);
      const [{ units }, rows] = await Promise.all([
        loadPlan(db, schoolId, programId),
        loadRecords(db, schoolId, studentId, programId),
      ]);
      const records = rows.map((row) => row.record);
      const lines = transcriptLines(units, records);
      const progress = studentProgress({ plan: units, records, regulation });
      result.push({
        program: { id: programId, name: str(program.name) },
        progress: { ...progress, pendingUnits: progress.pendingUnits.length },
        lines: lines.map((line) => ({
          unitId: line.unit.id,
          name: line.unit.name,
          semester: line.unit.semester,
          credits: line.unit.credits,
          state: line.state,
          grade: line.grade,
          season: line.season,
          lastStatus: line.lastStatus,
          attempts: line.attempts,
        })),
      });
    }
    return { programs: result };
  });

// ── Matrícula on-line (o estudante inscreve-se) ──────────────────────────────

/** Só a conta do próprio estudante; o encarregado vê o percurso mas não inscreve. */
async function ownStudent(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (membership?.appRole !== "Aluno") return null;
  return resolveVisibleStudent(userId);
}

/** Cursos superiores em que o estudante tem matrícula activa (ou pendente). */
async function enrolledProgramsOf(db: Db, schoolId: string, studentId: string) {
  const { data: enrollments } = await db
    .from("enrollments")
    .select("class_group_id")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .in("status", ["active", "pending"]);
  const groupIds = [...new Set((enrollments ?? []).map((e) => str(e.class_group_id)))];
  if (!groupIds.length) return [];
  const { data: groups } = await db
    .from("class_groups")
    .select("grade_level_id")
    .eq("school_id", schoolId)
    .in("id", groupIds);
  const gradeIds = [...new Set(((groups ?? []) as Row[]).map((g) => str(g.grade_level_id)))];
  if (!gradeIds.length) return [];
  const { data: grades } = await db
    .from("grade_levels")
    .select("program_id")
    .eq("school_id", schoolId)
    .in("id", gradeIds);
  const programIds = [
    ...new Set(((grades ?? []) as Row[]).map((g) => str(g.program_id)).filter(Boolean)),
  ];
  if (!programIds.length) return [];
  const { data: programs } = await db
    .from("programs")
    .select("id, name")
    .eq("school_id", schoolId)
    .in("kind", ["undergraduate", "postgraduate"])
    .in("id", programIds)
    .order("name");
  return ((programs ?? []) as Row[]).map((p) => ({ id: str(p.id), name: str(p.name) }));
}

/**
 * Cadeiras que o estudante pode escolher no portal, com o motivo das que estão
 * bloqueadas. `enabled: false` quando a escola não abriu a matrícula on-line.
 */
export const getMyEnrollmentOffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const own = await ownStudent(context.userId);
    if (!own) return { enabled: false as const };
    const { db, schoolId, studentId } = own;
    const regulation = await regulationOf(db, schoolId);
    if (!regulation.student_self_enrollment) return { enabled: false as const };
    const programs = await enrolledProgramsOf(db, schoolId, studentId);
    if (!programs.length) return { enabled: false as const };
    const yearId = await activeYearId(db, schoolId);
    const blocked: string[] = [];
    if (!yearId) blocked.push("Não há ano lectivo activo.");
    const windowError = enrollmentWindowError(regulation, todayIso());
    if (windowError) blocked.push(windowError);
    if (regulation.block_enrollment_with_debt) {
      const indebted = await studentsWithOverdueDebt(db, schoolId, [studentId]);
      if (indebted.has(studentId)) {
        blocked.push("Tem propinas vencidas por pagar: regularize-as na tesouraria.");
      }
    }
    const offers = [];
    for (const program of programs) {
      const [{ units, prerequisites }, rows] = await Promise.all([
        loadPlan(db, schoolId, program.id),
        loadRecords(db, schoolId, studentId, program.id),
      ]);
      const records = rows.map((row) => row.record);
      const offered = yearId
        ? enrollmentOffer({
            plan: units,
            prerequisites,
            records,
            regulation,
            academicYearId: yearId,
          })
        : [];
      const creditsThisYear = yearId
        ? records
            .filter((r) => r.academicYearId === yearId && r.status === "inscrito")
            .reduce((sum, r) => sum + r.credits, 0)
        : 0;
      offers.push({
        program,
        creditsThisYear,
        units: offered.map((offer) => ({
          id: offer.unit.id,
          name: offer.unit.name,
          semester: offer.unit.semester,
          credits: offer.unit.credits,
          state: offer.state,
          reasons: offer.reasons,
        })),
      });
    }
    return {
      enabled: true as const,
      blocked,
      limits: {
        perYear: regulation.max_credits_per_year,
        perSemester: regulation.max_credits_per_semester,
      },
      closesOn: regulation.enrollment_closes_on,
      offers,
    };
  });

/** O estudante inscreve-se em cadeiras: mesmas regras da secretaria, com auditoria. */
export const enrollMyUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        programId: z.string().uuid(),
        unitIds: z.array(z.string().uuid()).min(1).max(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const own = await ownStudent(context.userId);
    if (!own) throw new Error("Só o próprio estudante se inscreve nas cadeiras.");
    const { db, schoolId, studentId } = own;
    const regulation = await regulationOf(db, schoolId);
    if (!regulation.student_self_enrollment) {
      throw new Error("A inscrição em cadeiras faz-se na secretaria.");
    }
    const result = await enrollUnitsFor(db, {
      schoolId,
      studentId,
      programId: data.programId,
      unitIds: data.unitIds,
      actor: context.userId,
      regulation,
    });
    await audit(db, {
      schoolId,
      actor: context.userId,
      action: "higher_ed.enrollment.self",
      entityId: result.ids[0] ?? studentId,
      metadata: {
        student_id: studentId,
        program_id: data.programId,
        enrollment_ids: result.ids,
        units: result.units,
        credits: result.credits,
      },
    });
    return { enrolled: result.enrolled, credits: result.credits };
  });

// ── Acesso (exame de acesso e seriação) ─────────────────────────────────────

type ApplicationPayload = {
  desiredProgram?: { id?: string; name?: string };
  accessScore?: number | null;
  person?: { email?: string; phone_primary?: string };
} & Record<string, unknown>;

/** Candidatos a um curso, seriados pela nota do exame de acesso e cortados nas vagas. */
export const getAccessRanking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ programId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    await requireProgram(db, schoolId, data.programId);
    const [profiles, regulation, { data: rows, error }] = await Promise.all([
      readSettingsDomain(db, schoolId, "higher_ed_programs"),
      regulationOf(db, schoolId),
      db
        .from("enrollment_applications")
        .select("id, full_name, status, payload, created_at")
        .eq("school_id", schoolId)
        .in("status", ["pending", "accepted"])
        .is("deleted_at", null)
        .order("created_at")
        .limit(2000),
    ]);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as candidaturas.");
    const seats = parseProgramProfile(profiles[data.programId]).seats;
    const candidates = ((rows ?? []) as Row[])
      .filter((row) => (row.payload as ApplicationPayload)?.desiredProgram?.id === data.programId)
      .map((row) => {
        const payload = (row.payload ?? {}) as ApplicationPayload;
        return {
          id: str(row.id),
          name: str(row.full_name),
          status: str(row.status),
          score: typeof payload.accessScore === "number" ? payload.accessScore : null,
          createdAt: str(row.created_at),
        };
      });
    return {
      seats,
      minimumScore: regulation.access_min_score,
      ranking: rankAccessCandidates(candidates, seats, regulation.access_min_score),
    };
  });

/** Regista (ou apaga) a nota do exame de acesso de uma candidatura. */
export const setApplicationAccessScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        score: z.number().min(0).max(20).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await officeMembership(context, "write");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: row, error: readError } = await db
      .from("enrollment_applications")
      .select("id, payload, version, status")
      .eq("school_id", schoolId)
      .eq("id", data.applicationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (readError) throw publicDatabaseError(readError, "Não foi possível ler a candidatura.");
    if (!row) throw new Error("Candidatura não encontrada nesta escola.");
    if (str(row.status) !== "pending") {
      throw new Error("Só se lança a nota de acesso numa candidatura pendente.");
    }
    const payload = (row.payload ?? {}) as ApplicationPayload;
    const score = data.score === null ? null : Math.round(data.score * 10) / 10;
    const version = Number(row.version ?? 1);
    const { data: saved, error } = await db
      .from("enrollment_applications")
      .update({
        payload: { ...payload, accessScore: score } as never,
        version: version + 1,
        updated_by: context.userId,
      })
      .eq("school_id", schoolId)
      .eq("id", data.applicationId)
      .eq("version", version)
      .select("id");
    if (error) throw publicDatabaseError(error, "Não foi possível guardar a nota de acesso.");
    if (!saved?.length) {
      throw new Error("A candidatura mudou entretanto. Actualize a página e tente de novo.");
    }
    await db.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      action: "higher_ed.access.score",
      entity_type: "enrollment_application",
      entity_id: data.applicationId,
      metadata: { before: payload.accessScore ?? null, after: score } as never,
    });
    return { score };
  });

// ── Exportação SISIES / GEPE (MESCTI) ───────────────────────────────────────

const DEGREE_TEXT = {
  licenciatura: "Licenciatura",
  mestrado: "Mestrado",
  doutoramento: "Doutoramento",
  especializacao: "Especialização",
} as const;
const MODALITY_TEXT = {
  presencial: "Presencial",
  semipresencial: "Semipresencial",
  distancia: "A distância",
} as const;
const REGIME_TEXT = { regular: "Regular", pos_laboral: "Pós-laboral" } as const;

/**
 * Ficheiro Excel com as bases que o GEPE/MESCTI recolhe pelo SISIES e que o
 * SIGA conhece: Vagas, Acesso, Matrículas e Graduados (por curso, no ano activo).
 */
export const exportSisiesWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await officeMembership(context, "read");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const yearId = await activeYearId(db, schoolId);
    const [{ data: school }, { data: year }, { data: programRows }, profiles] = await Promise.all([
      db.from("schools").select("name, nif").eq("id", schoolId).maybeSingle(),
      yearId
        ? db
            .from("academic_years")
            .select("name")
            .eq("school_id", schoolId)
            .eq("id", yearId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from("programs")
        .select("id, code, name")
        .eq("school_id", schoolId)
        .in("kind", ["undergraduate", "postgraduate"])
        .order("name"),
      readSettingsDomain(db, schoolId, "higher_ed_programs"),
    ]);
    const programs = (programRows ?? []) as Row[];
    const programIds = programs.map((p) => str(p.id));

    // Matrículas no ano activo, por curso e ano curricular, com o sexo.
    const { data: grades } = programIds.length
      ? await db
          .from("grade_levels")
          .select("id, program_id, sequence")
          .eq("school_id", schoolId)
          .in("program_id", programIds)
      : { data: [] as Row[] };
    const gradeById = new Map(((grades ?? []) as Row[]).map((g) => [str(g.id), g]));
    let groupsQuery = db
      .from("class_groups")
      .select("id, grade_level_id")
      .eq("school_id", schoolId)
      .in("grade_level_id", [...gradeById.keys()]);
    if (yearId) groupsQuery = groupsQuery.eq("academic_year_id", yearId);
    const { data: groups } = gradeById.size ? await groupsQuery : { data: [] as Row[] };
    const gradeOfGroup = new Map((groups ?? []).map((g) => [str(g.id), str(g.grade_level_id)]));
    const { data: enrollments } = gradeOfGroup.size
      ? await db
          .from("enrollments")
          .select("student_id, class_group_id")
          .eq("school_id", schoolId)
          .in("class_group_id", [...gradeOfGroup.keys()])
          .in("status", ["active", "pending"])
          .limit(20000)
      : { data: [] as Row[] };
    const studentIds = [...new Set(((enrollments ?? []) as Row[]).map((e) => str(e.student_id)))];
    const { data: students } = studentIds.length
      ? await db
          .from("students")
          .select("id, person_id")
          .eq("school_id", schoolId)
          .in("id", studentIds)
      : { data: [] as Row[] };
    const personIds = ((students ?? []) as Row[]).map((s) => str(s.person_id));
    const { data: people } = personIds.length
      ? await db.from("people").select("id, sex").eq("school_id", schoolId).in("id", personIds)
      : { data: [] as Row[] };
    const sexOfPerson = new Map(((people ?? []) as Row[]).map((p) => [str(p.id), str(p.sex)]));
    const sexOfStudent = new Map(
      ((students ?? []) as Row[]).map((s) => [str(s.id), sexOfPerson.get(str(s.person_id)) ?? ""]),
    );
    type Count = { total: number; m: number; f: number; byYear: Map<number, number> };
    const enrolledBy = new Map<string, Count>();
    for (const enrollment of (enrollments ?? []) as Row[]) {
      const grade = gradeById.get(gradeOfGroup.get(str(enrollment.class_group_id)) ?? "");
      if (!grade) continue;
      const programId = str(grade.program_id);
      const count = enrolledBy.get(programId) ?? { total: 0, m: 0, f: 0, byYear: new Map() };
      const sex = sexOfStudent.get(str(enrollment.student_id));
      count.total += 1;
      if (sex === "M") count.m += 1;
      if (sex === "F") count.f += 1;
      const sequence = Number(grade.sequence ?? 0);
      count.byYear.set(sequence, (count.byYear.get(sequence) ?? 0) + 1);
      enrolledBy.set(programId, count);
    }

    // Acesso: candidaturas pelo curso pretendido.
    const { data: applications } = await db
      .from("enrollment_applications")
      .select("status, payload")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .limit(20000);
    const accessBy = new Map<string, { candidates: number; scored: number; accepted: number }>();
    for (const application of (applications ?? []) as Row[]) {
      const payload = (application.payload ?? {}) as ApplicationPayload;
      const programId = payload.desiredProgram?.id;
      if (!programId) continue;
      const entry = accessBy.get(programId) ?? { candidates: 0, scored: 0, accepted: 0 };
      entry.candidates += 1;
      if (typeof payload.accessScore === "number") entry.scored += 1;
      if (str(application.status) === "accepted") entry.accepted += 1;
      accessBy.set(programId, entry);
    }

    // Graduados: estudantes com todas as cadeiras do plano concluídas.
    const regulation = await regulationOf(db, schoolId);
    const graduatesBy = new Map<string, { total: number; averages: number[] }>();
    for (const programId of programIds) {
      const { units } = await loadPlan(db, schoolId, programId);
      if (!units.length) continue;
      const { data: recordRows } = await db
        .from("course_unit_enrollments")
        .select(RECORD_COLUMNS)
        .eq("school_id", schoolId)
        .eq("program_id", programId)
        .limit(50000);
      const byStudent = new Map<string, UnitRecord[]>();
      for (const row of (recordRows ?? []) as Row[]) {
        const list = byStudent.get(str(row.student_id)) ?? [];
        list.push(toRecord(row));
        byStudent.set(str(row.student_id), list);
      }
      const entry = { total: 0, averages: [] as number[] };
      for (const records of byStudent.values()) {
        const done = completedUnitIds(records);
        if (!units.every((unit) => done.has(unit.id))) continue;
        entry.total += 1;
        const final = finalClassification(
          studentProgress({ plan: units, records, regulation }).average,
        );
        if (final) entry.averages.push(final.value);
      }
      graduatesBy.set(programId, entry);
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SIGA";
    const header = (sheet: import("exceljs").Worksheet, columns: string[]) => {
      sheet.addRow([
        str(school?.name),
        `NIF ${str(school?.nif)}`,
        `Ano lectivo ${str(year?.name)}`,
      ]);
      sheet.addRow([]);
      const row = sheet.addRow(columns);
      row.font = { bold: true };
      sheet.columns.forEach((column) => (column.width = 22));
    };
    const profileOf = (id: string) => parseProgramProfile(profiles[id]);
    const vagas = workbook.addWorksheet("Vagas");
    header(vagas, ["Código", "Curso", "Grau", "Modalidade", "Regime", "Vagas"]);
    const acesso = workbook.addWorksheet("Acesso");
    header(acesso, ["Código", "Curso", "Vagas", "Candidatos", "Com nota de acesso", "Admitidos"]);
    const matriculas = workbook.addWorksheet("Matrículas");
    header(matriculas, [
      "Código",
      "Curso",
      "Grau",
      "Total",
      "Masculino",
      "Feminino",
      "1.º ano",
      "2.º ano",
      "3.º ano",
      "4.º ano",
      "5.º ano ou mais",
    ]);
    const graduados = workbook.addWorksheet("Graduados");
    header(graduados, ["Código", "Curso", "Grau", "Graduados", "Classificação média"]);
    for (const program of programs) {
      const id = str(program.id);
      const profile = profileOf(id);
      const code = str(program.code);
      const name = str(program.name);
      vagas.addRow([
        code,
        name,
        DEGREE_TEXT[profile.degree],
        MODALITY_TEXT[profile.modality],
        REGIME_TEXT[profile.regime],
        profile.seats,
      ]);
      const access = accessBy.get(id) ?? { candidates: 0, scored: 0, accepted: 0 };
      acesso.addRow([code, name, profile.seats, access.candidates, access.scored, access.accepted]);
      const enrolled = enrolledBy.get(id) ?? { total: 0, m: 0, f: 0, byYear: new Map() };
      const fifthPlus = [...enrolled.byYear.entries()]
        .filter(([sequence]) => sequence >= 5)
        .reduce((sum, [, n]) => sum + n, 0);
      matriculas.addRow([
        code,
        name,
        DEGREE_TEXT[profile.degree],
        enrolled.total,
        enrolled.m,
        enrolled.f,
        enrolled.byYear.get(1) ?? 0,
        enrolled.byYear.get(2) ?? 0,
        enrolled.byYear.get(3) ?? 0,
        enrolled.byYear.get(4) ?? 0,
        fifthPlus,
      ]);
      const graduates = graduatesBy.get(id) ?? { total: 0, averages: [] };
      graduados.addRow([
        code,
        name,
        DEGREE_TEXT[profile.degree],
        graduates.total,
        graduates.averages.length
          ? Math.round(
              (graduates.averages.reduce((a, b) => a + b, 0) / graduates.averages.length) * 10,
            ) / 10
          : "",
      ]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    await db.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      action: "higher_ed.sisies.exported",
      entity_type: "school",
      entity_id: schoolId,
      metadata: { programs: programs.length, year: year?.name ?? null } as never,
    });
    return {
      fileName: `SISIES_${normalizeProgramCode(str(school?.name) || "IES")}_${str(year?.name).replace(/\W+/g, "-") || "ano"}.xlsx`,
      base64: Buffer.from(buffer as ArrayBuffer).toString("base64"),
    };
  });

// ── Emolumentos ────────────────────────────────────────────────────────────

const FINANCE_READERS = ["Administrador", "Secretaria", "Tesouraria"] as const;
const FINANCE_WRITERS = ["Administrador", "Tesouraria"] as const;

async function activeFeePlanId(db: Db, schoolId: string) {
  const { data } = await db
    .from("fee_plans")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data?.id ? str(data.id) : null;
}

/** Valores dos emolumentos no plano financeiro activo (0 = ainda não definido). */
export const getHigherEdFees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      ...FINANCE_READERS,
    ]);
    const db = await loadSgaAdminClient();
    const planId = await activeFeePlanId(db, membership.schoolId);
    const { data: items } = planId
      ? await db
          .from("fee_items")
          .select("code, amount, is_active")
          .eq("school_id", membership.schoolId)
          .eq("fee_plan_id", planId)
          .in(
            "code",
            HIGHER_ED_FEES.map((fee) => fee.code),
          )
      : { data: [] as Row[] };
    const byCode = new Map(((items ?? []) as Row[]).map((item) => [str(item.code), item]));
    return {
      hasPlan: Boolean(planId),
      fees: HIGHER_ED_FEES.map((fee) => {
        const item = byCode.get(fee.code);
        return {
          ...fee,
          amount: item && item.is_active ? Number(item.amount ?? 0) : 0,
        };
      }),
    };
  });

export const saveHigherEdFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        fees: z
          .array(
            z.object({
              code: z.enum(HIGHER_ED_FEES.map((fee) => fee.code) as [string, ...string[]]),
              amount: z.number().min(0).max(999_999_999),
            }),
          )
          .min(1)
          .max(HIGHER_ED_FEES.length),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      [...FINANCE_WRITERS],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const planId = await activeFeePlanId(db, schoolId);
    if (!planId) {
      throw new Error(
        "Não há plano financeiro activo. Defina primeiro a propina em Definições → Financeiro.",
      );
    }
    const changes: Row[] = [];
    for (const fee of data.fees) {
      const meta = HIGHER_ED_FEES.find((item) => item.code === fee.code)!;
      const { data: existing } = await db
        .from("fee_items")
        .select("id, amount")
        .eq("school_id", schoolId)
        .eq("fee_plan_id", planId)
        .eq("code", fee.code)
        .maybeSingle();
      if (existing?.id) {
        if (Number(existing.amount ?? 0) === fee.amount) continue;
        const { error } = await db
          .from("fee_items")
          .update({ amount: fee.amount, name: meta.name, is_active: fee.amount > 0 })
          .eq("school_id", schoolId)
          .eq("id", existing.id);
        if (error) throw publicDatabaseError(error, "Não foi possível guardar o emolumento.");
      } else {
        if (fee.amount === 0) continue;
        const { error } = await db.from("fee_items").insert({
          school_id: schoolId,
          fee_plan_id: planId,
          code: fee.code,
          name: meta.name,
          kind: "service",
          frequency: "once",
          amount: fee.amount,
          is_active: true,
        });
        if (error) throw publicDatabaseError(error, "Não foi possível criar o emolumento.");
      }
      changes.push({ code: fee.code, before: existing?.amount ?? null, after: fee.amount });
    }
    if (changes.length) {
      await db.from("audit_logs").insert({
        school_id: schoolId,
        actor_user_id: context.userId,
        action: "higher_ed.fees.saved",
        entity_type: "fee_plan",
        entity_id: planId,
        metadata: { changes } as never,
      });
    }
    return { changed: changes.length };
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
      .select("id, version, value")
      .eq("school_id", membership.schoolId)
      .eq("domain", "higher_ed")
      .maybeSingle();
    if (existing?.id) {
      // Só grava sobre a versão lida: duas edições em simultâneo não se apagam.
      const { data: saved, error } = await db
        .from("school_settings")
        .update({ value, version: Number(existing.version ?? 1) + 1, changed_by: context.userId })
        .eq("id", existing.id)
        .eq("school_id", membership.schoolId)
        .eq("version", existing.version)
        .select("id");
      if (error) throw publicDatabaseError(error, "Não foi possível guardar o regulamento.");
      if (!saved?.length) {
        throw new Error("O regulamento mudou entretanto. Actualize a página e guarde de novo.");
      }
    } else {
      const { error } = await db.from("school_settings").insert({
        school_id: membership.schoolId,
        domain: "higher_ed",
        version: 1,
        value,
        changed_by: context.userId,
      });
      if (error) throw publicDatabaseError(error, "Não foi possível guardar o regulamento.");
    }
    // O regulamento decide aprovações: cada alteração fica na auditoria.
    await db.from("audit_logs").insert({
      school_id: membership.schoolId,
      actor_user_id: context.userId,
      action: "higher_ed.regulation.saved",
      entity_type: "school_settings",
      entity_id: existing?.id ? str(existing.id) : null,
      metadata: { before: existing?.value ?? null, after: value } as never,
    });
    return { regulation: value };
  });
