import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { ENROLLMENT_2FA_MESSAGE, placeStudentInClass } from "@/features/students/enrollment-core";
import {
  nextGradeLevel,
  planRenewal,
  suggestTargetGroup,
  type RolloverGroup,
  type RolloverLine,
} from "./year-rollover";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));

const MANAGE_ROLES: Array<"Administrador" | "Secretaria"> = ["Administrador", "Secretaria"];
/** Turmas do novo ano que podem receber alunos: as activas e as ainda em preparação. */
const OPEN_GROUP_STATUSES = ["active", "draft"];
const CURRENT = ["pending", "active"];

const renewalInputSchema = z.object({
  sourceClassGroupId: z.string().guid(),
  targetAcademicYearId: z.string().guid(),
  passClassGroupId: z.string().guid().optional(),
  repeatClassGroupId: z.string().guid().optional(),
});
const applyRenewalInputSchema = renewalInputSchema.extend({
  /** Alunos que a secretaria deixou marcados; o plano é recalculado aqui. */
  studentIds: z.array(z.string().guid()).max(200),
});

export type RenewalPlan = {
  source: { id: string; name: string; yearName: string; gradeName: string | null };
  targetYear: { id: string; name: string };
  isLastGrade: boolean;
  /** Sem curso ou sequência na classe: a classe seguinte não se sabe. */
  gradeOrderKnown: boolean;
  passOptions: Array<{ id: string; name: string; free: number | null }>;
  repeatOptions: Array<{ id: string; name: string; free: number | null }>;
  passClassGroupId: string | null;
  repeatClassGroupId: string | null;
  lines: RolloverLine[];
};

export async function buildRenewalPlan(
  db: Db,
  schoolId: string,
  input: z.infer<typeof renewalInputSchema>,
): Promise<RenewalPlan> {
  const fail = (error: unknown, message: string): never => {
    throw publicDatabaseError(error as never, message);
  };

  const { data: source, error: sourceError } = await db
    .from("class_groups")
    .select("id, name, shift, academic_year_id, grade_level_id, capacity")
    .eq("id", input.sourceClassGroupId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (sourceError) fail(sourceError, "Não foi possível ler a turma de origem.");
  if (!source) throw new Error("Turma de origem não encontrada nesta escola.");

  const { data: years, error: yearsError } = await db
    .from("academic_years")
    .select("id, name, starts_on")
    .eq("school_id", schoolId)
    .in("id", [str(source.academic_year_id), input.targetAcademicYearId]);
  if (yearsError) fail(yearsError, "Não foi possível ler os anos lectivos.");
  const sourceYear = (years ?? []).find((y) => str(y.id) === str(source.academic_year_id));
  const targetYear = (years ?? []).find((y) => str(y.id) === input.targetAcademicYearId);
  if (!sourceYear || !targetYear) throw new Error("Ano lectivo não encontrado nesta escola.");
  if (!(str(targetYear.starts_on) > str(sourceYear.starts_on))) {
    throw new Error("O ano de destino tem de começar depois do ano da turma de origem.");
  }

  const { data: levelRows, error: levelsError } = await db
    .from("grade_levels")
    .select("id, program_id, sequence, name")
    .eq("school_id", schoolId);
  if (levelsError) fail(levelsError, "Não foi possível ler as classes.");
  const levels = (levelRows ?? []).map((row) => ({
    id: str(row.id),
    programId: row.program_id ? str(row.program_id) : null,
    sequence: row.sequence == null ? null : Number(row.sequence),
    name: str(row.name),
  }));
  const sourceGradeId = source.grade_level_id ? str(source.grade_level_id) : null;
  const grade = nextGradeLevel(levels, sourceGradeId);

  const { data: targetRows, error: targetError } = await db
    .from("class_groups")
    .select("id, name, shift, academic_year_id, grade_level_id, capacity")
    .eq("school_id", schoolId)
    .eq("academic_year_id", targetYear.id)
    .in("status", OPEN_GROUP_STATUSES)
    .order("name");
  if (targetError) fail(targetError, "Não foi possível ler as turmas do novo ano.");
  const targetIds = (targetRows ?? []).map((row) => str(row.id));
  const { data: occupied, error: occupiedError } = targetIds.length
    ? await db
        .from("enrollments")
        .select("class_group_id")
        .eq("school_id", schoolId)
        .in("class_group_id", targetIds)
        .in("status", CURRENT)
    : { data: [] as Row[], error: null };
  if (occupiedError) fail(occupiedError, "Não foi possível contar as vagas.");
  const count = new Map<string, number>();
  for (const row of occupied ?? []) {
    const id = str((row as Row).class_group_id);
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  const toGroup = (row: Row): RolloverGroup => ({
    id: str(row.id),
    name: str(row.name),
    shift: row.shift ? str(row.shift) : null,
    academicYearId: str(row.academic_year_id),
    gradeLevelId: row.grade_level_id ? str(row.grade_level_id) : null,
    capacity: row.capacity == null ? null : Number(row.capacity),
    enrolledCount: count.get(str(row.id)) ?? 0,
  });
  const candidates = (targetRows ?? []).map(toGroup);
  const sourceGroup = toGroup(source as Row);
  const passCandidates = grade.next
    ? candidates.filter((g) => g.gradeLevelId === grade.next!.id)
    : [];
  const repeatCandidates = candidates.filter(
    (g) => sourceGradeId && g.gradeLevelId === sourceGradeId,
  );

  const pick = (
    requested: string | undefined,
    options: RolloverGroup[],
    gradeId: string | null,
    label: string,
  ) => {
    if (!requested) return suggestTargetGroup(sourceGroup, options, gradeId);
    const chosen = options.find((g) => g.id === requested);
    if (!chosen) throw new Error(`A turma escolhida não serve para ${label}.`);
    return chosen;
  };
  const passTarget = grade.isLast
    ? null
    : pick(input.passClassGroupId, passCandidates, grade.next?.id ?? null, "a classe seguinte");
  const repeatTarget = pick(
    input.repeatClassGroupId,
    repeatCandidates,
    sourceGradeId,
    "repetir a classe",
  );

  // Alunos da turma de origem: as matrículas do ano, incluindo as já concluídas.
  const { data: enrollments, error: enrollmentsError } = await db
    .from("enrollments")
    .select("id, student_id, status")
    .eq("school_id", schoolId)
    .eq("class_group_id", source.id)
    .in("status", [...CURRENT, "completed"]);
  if (enrollmentsError) fail(enrollmentsError, "Não foi possível ler os alunos da turma.");
  const enrollmentIds = (enrollments ?? []).map((row) => str(row.id));
  const studentIds = [...new Set((enrollments ?? []).map((row) => str(row.student_id)))];

  const [studentsRead, historyRead, targetEnrollmentsRead] = await Promise.all([
    studentIds.length
      ? db
          .from("students")
          .select("id, status, person_id")
          .eq("school_id", schoolId)
          .in("id", studentIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    enrollmentIds.length
      ? db
          .from("student_academic_history")
          .select("enrollment_id, student_id, academic_year_label, outcome, updated_at")
          .eq("school_id", schoolId)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    studentIds.length
      ? db
          .from("enrollments")
          .select("student_id, class_group_id")
          .eq("school_id", schoolId)
          .eq("academic_year_id", targetYear.id)
          .in("student_id", studentIds)
          .in("status", CURRENT)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  if (studentsRead.error) fail(studentsRead.error, "Não foi possível ler os alunos.");
  if (historyRead.error) fail(historyRead.error, "Não foi possível ler o histórico académico.");
  if (targetEnrollmentsRead.error) {
    fail(targetEnrollmentsRead.error, "Não foi possível ler as matrículas do novo ano.");
  }

  const personIds = (studentsRead.data ?? []).map((row) => str((row as Row).person_id));
  const { data: people, error: peopleError } = personIds.length
    ? await db.from("people").select("id, full_name").eq("school_id", schoolId).in("id", personIds)
    : { data: [] as Row[], error: null };
  if (peopleError) fail(peopleError, "Não foi possível ler os nomes dos alunos.");
  const nameOf = new Map((people ?? []).map((row) => [str(row.id), str(row.full_name)]));

  // O resultado desta matrícula; registos antigos sem matrícula contam pelo nome do ano.
  const enrollmentSet = new Set(enrollmentIds);
  const outcomeOf = new Map<string, { outcome: string; at: string; exact: boolean }>();
  for (const row of (historyRead.data ?? []) as Row[]) {
    const exact = enrollmentSet.has(str(row.enrollment_id));
    if (!exact && str(row.academic_year_label) !== str(sourceYear.name)) continue;
    const key = str(row.student_id);
    const previous = outcomeOf.get(key);
    const at = str(row.updated_at);
    if (!previous || (exact && !previous.exact) || (exact === previous.exact && at > previous.at)) {
      outcomeOf.set(key, { outcome: str(row.outcome), at, exact });
    }
  }
  const targetClassOf = new Map(
    ((targetEnrollmentsRead.data ?? []) as Row[]).map((row) => [
      str(row.student_id),
      str(row.class_group_id),
    ]),
  );

  const lines = planRenewal({
    students: ((studentsRead.data ?? []) as Row[]).map((row) => ({
      studentId: str(row.id),
      name: nameOf.get(str(row.person_id)) || "—",
      studentStatus: row.status ? str(row.status) : null,
      outcome: outcomeOf.get(str(row.id))?.outcome ?? null,
      targetYearClassGroupId: targetClassOf.get(str(row.id)) ?? null,
    })),
    passTarget,
    repeatTarget,
    isLastGrade: grade.isLast,
  });

  const option = (group: RolloverGroup) => ({
    id: group.id,
    name: group.name,
    free:
      group.capacity && group.capacity > 0
        ? Math.max(0, group.capacity - (group.enrolledCount ?? 0))
        : null,
  });
  return {
    source: {
      id: str(source.id),
      name: str(source.name),
      yearName: str(sourceYear.name),
      gradeName: levels.find((l) => l.id === sourceGradeId)?.name ?? null,
    },
    targetYear: { id: str(targetYear.id), name: str(targetYear.name) },
    isLastGrade: grade.isLast,
    gradeOrderKnown: grade.known,
    passOptions: passCandidates.map(option),
    repeatOptions: repeatCandidates.map(option),
    passClassGroupId: passTarget?.id ?? null,
    repeatClassGroupId: repeatTarget?.id ?? null,
    lines,
  };
}

/** Plano de renovação de uma turma para o ano seguinte. Não grava nada. */
export const getRenewalPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => renewalInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor(
      "pessoas",
      context.supabase,
      context.userId,
      MANAGE_ROLES,
    );
    return buildRenewalPlan(await loadSgaAdminClient(), membership.schoolId, data);
  });

export type RenewalResult = {
  enrolled: Array<{ studentId: string; name: string }>;
  failed: Array<{ studentId: string; name: string; message: string }>;
  skipped: number;
};

/**
 * Matricula os alunos marcados. O plano é recalculado aqui: o navegador só diz
 * quem fica marcado, nunca para onde vai nem com que resultado.
 */
export const applyRenewal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => applyRenewalInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<RenewalResult> => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite(
      "pessoas",
      context.supabase,
      context.userId,
      MANAGE_ROLES,
    );
    // Sem 2FA cada aluno falhava com o mesmo erro; recusa-se logo.
    const hasAal2 = context.claims?.["aal"] === "aal2";
    if (!hasAal2) throw new Error(ENROLLMENT_2FA_MESSAGE);
    const db = await loadSgaAdminClient();
    const plan = await buildRenewalPlan(db, membership.schoolId, data);
    const marked = new Set(data.studentIds);
    const result: RenewalResult = { enrolled: [], failed: [], skipped: 0 };
    for (const line of plan.lines) {
      if (line.action !== "enroll" || !line.targetClassGroupId || !marked.has(line.studentId)) {
        result.skipped += 1;
        continue;
      }
      try {
        await placeStudentInClass(db, context.supabase, {
          schoolId: membership.schoolId,
          studentId: line.studentId,
          classGroupId: line.targetClassGroupId,
          academicYearId: plan.targetYear.id,
          userId: context.userId,
          hasAal2,
        });
        result.enrolled.push({ studentId: line.studentId, name: line.name });
      } catch (error) {
        result.failed.push({
          studentId: line.studentId,
          name: line.name,
          message: error instanceof Error ? error.message : "Falha ao matricular.",
        });
      }
    }
    return result;
  });
