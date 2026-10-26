/**
 * Organizar turmas por idade (Pessoas → Organizar turmas): uma classe e um turno
 * do ano lectivo de cada vez. Pré-visualizar lê; aplicar recalcula tudo no
 * servidor, confere a assinatura do plano visto e muda cada aluno pela regra
 * única de colocação (`placeStudentInClass`: 2FA, gatilho de lotação, histórico).
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
import { ENROLLMENT_2FA_MESSAGE, placeStudentInClass } from "@/features/students/enrollment-core";
import { recordAccessAudit } from "@/features/audit/record-audit";
import { todayInLuanda } from "@/features/calendar/dates";
import { buildOrganizationPlan, orderMoves, type OrganizationPlan } from "./class-organization";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));

const MANAGE_ROLES: Array<"Administrador" | "Secretaria"> = ["Administrador", "Secretaria"];
const CURRENT = ["pending", "active"];
/** Registos por matrícula que prendem o aluno à turma onde estão. */
const RECORD_TABLES = [
  "siga_assessment_scores",
  "grade_scores",
  "grade_sheet_rows",
  // Modelo anterior da chamada: já ninguém escreve, mas pode guardar histórico.
  "attendance_records",
  "siga_class_task_submissions",
  "report_cards",
  "siga_exam_registrations",
] as const;
/** Linhas por leitura; quem já apareceu sai do filtro na leitura seguinte. */
const RECORD_PAGE = 1000;
const RECORD_PASSES = 8;

type RecordRead = PromiseLike<{
  data: unknown;
  error: Parameters<typeof publicDatabaseError>[0] | null;
}>;

/**
 * Os `ids` com pelo menos uma linha. O PostgREST não faz DISTINCT e um aluno com
 * centenas de presenças enche a página sozinho: cada passagem tira do filtro quem
 * já apareceu. Se as passagens acabarem com a página ainda cheia, quem falta conta
 * como «com registos» — na dúvida, o aluno fica onde está.
 */
async function idsWithRows(
  read: (remaining: string[]) => RecordRead,
  column: string,
  ids: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  let remaining = ids;
  for (let pass = 0; pass < RECORD_PASSES && remaining.length; pass += 1) {
    const { data, error } = await read(remaining);
    if (error) throw publicDatabaseError(error, "Não foi possível confirmar as notas e presenças.");
    const rows = (data ?? []) as Row[];
    for (const row of rows) found.add(str(row[column]));
    if (rows.length < RECORD_PAGE) return found;
    remaining = remaining.filter((id) => !found.has(id));
  }
  for (const id of remaining) found.add(id);
  return found;
}

const SHIFT_LABELS: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};

const scopeInput = z.object({
  academicYearId: z.string().guid().optional(),
  gradeLevelId: z.string().guid(),
  shift: z.string().trim().min(1).max(32),
});

async function activeYear(db: Db, schoolId: string, requested?: string) {
  let query = db
    .from("academic_years")
    .select("id, name, status")
    .eq("school_id", schoolId)
    .order("starts_on", { ascending: false })
    .limit(1);
  query = requested ? query.eq("id", requested) : query.eq("status", "active");
  const { data, error } = await query.maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível ler o ano lectivo.");
  if (!data) throw new Error("A escola não tem ano lectivo activo.");
  return { id: str(data.id), name: str(data.name) };
}

export type OrganizationScope = {
  gradeLevelId: string;
  gradeLevelName: string;
  programName: string;
  shift: string;
  shiftLabel: string;
  classes: number;
  students: number;
};

/** As classes e turnos do ano com turmas abertas, para escolher o que organizar. */
export const listOrganizationScopes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ academicYearId: z.string().guid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor(
      "pessoas",
      context.supabase,
      context.userId,
      MANAGE_ROLES,
    );
    const db = await loadSgaAdminClient();
    const year = await activeYear(db, membership.schoolId, data.academicYearId);
    const { data: groups, error } = await db
      .from("class_groups")
      .select("id, grade_level_id, shift")
      .eq("school_id", membership.schoolId)
      .eq("academic_year_id", year.id)
      .neq("status", "closed");
    if (error) throw publicDatabaseError(error, "Não foi possível ler as turmas.");
    const groupRows = (groups ?? []) as Row[];
    const groupIds = groupRows.map((row) => str(row.id));
    const levelIds = [...new Set(groupRows.map((row) => str(row.grade_level_id)))];
    const [{ data: levels }, { data: enrollments }] = await Promise.all([
      levelIds.length
        ? db
            .from("grade_levels")
            .select("id, name, sequence, program_id")
            .eq("school_id", membership.schoolId)
            .in("id", levelIds)
        : Promise.resolve({ data: [] as Row[] }),
      groupIds.length
        ? db
            .from("enrollments")
            .select("class_group_id")
            .eq("school_id", membership.schoolId)
            .in("class_group_id", groupIds)
            .in("status", CURRENT)
        : Promise.resolve({ data: [] as Row[] }),
    ]);
    const programIds = [
      ...new Set(((levels ?? []) as Row[]).map((row) => str(row.program_id)).filter(Boolean)),
    ];
    const { data: programs } = programIds.length
      ? await db
          .from("programs")
          .select("id, name")
          .eq("school_id", membership.schoolId)
          .in("id", programIds)
      : { data: [] as Row[] };
    const levelOf = new Map(((levels ?? []) as Row[]).map((row) => [str(row.id), row]));
    const programName = new Map(
      ((programs ?? []) as Row[]).map((row) => [str(row.id), str(row.name)]),
    );
    const studentsIn = new Map<string, number>();
    for (const row of (enrollments ?? []) as Row[]) {
      const id = str(row.class_group_id);
      studentsIn.set(id, (studentsIn.get(id) ?? 0) + 1);
    }
    const scopes = new Map<string, OrganizationScope & { sequence: number }>();
    for (const group of groupRows) {
      const level = levelOf.get(str(group.grade_level_id));
      if (!level) continue;
      const key = `${str(group.grade_level_id)}|${str(group.shift)}`;
      const scope = scopes.get(key) ?? {
        gradeLevelId: str(group.grade_level_id),
        gradeLevelName: str(level.name),
        programName: programName.get(str(level.program_id)) ?? "",
        shift: str(group.shift),
        shiftLabel: SHIFT_LABELS[str(group.shift)] ?? str(group.shift),
        classes: 0,
        students: 0,
        sequence: Number(level.sequence ?? 0),
      };
      scope.classes += 1;
      scope.students += studentsIn.get(str(group.id)) ?? 0;
      scopes.set(key, scope);
    }
    return {
      year,
      scopes: [...scopes.values()]
        .sort(
          (a, b) =>
            a.programName.localeCompare(b.programName, "pt") ||
            a.sequence - b.sequence ||
            a.shift.localeCompare(b.shift),
        )
        .map(({ sequence: _sequence, ...scope }) => scope),
    };
  });

/** Lê a classe e o turno e devolve o plano. Partilhado por pré-visualizar e aplicar. */
async function loadPlan(
  db: Db,
  schoolId: string,
  input: z.infer<typeof scopeInput>,
): Promise<{
  plan: OrganizationPlan;
  yearId: string;
  counts: Map<string, number>;
  capacity: Map<string, number>;
}> {
  const year = await activeYear(db, schoolId, input.academicYearId);
  const [{ data: level, error: levelError }, { data: groups, error: groupError }] =
    await Promise.all([
      db
        .from("grade_levels")
        .select("id, program_id")
        .eq("school_id", schoolId)
        .eq("id", input.gradeLevelId)
        .maybeSingle(),
      db
        .from("class_groups")
        .select("id, code, name, capacity, status")
        .eq("school_id", schoolId)
        .eq("academic_year_id", year.id)
        .eq("grade_level_id", input.gradeLevelId)
        .eq("shift", input.shift)
        .neq("status", "closed"),
    ]);
  if (levelError || groupError) {
    throw publicDatabaseError(levelError ?? groupError!, "Não foi possível ler as turmas.");
  }
  if (!level) throw new Error("Classe não encontrada nesta escola.");
  const classes = ((groups ?? []) as Row[]).map((row) => ({
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    capacity: Number(row.capacity ?? 0),
    status: str(row.status) || "active",
  }));
  const groupIds = classes.map((group) => group.id);

  const { data: enrollments, error: enrollmentError } = groupIds.length
    ? await db
        .from("enrollments")
        .select("id, student_id, class_group_id")
        .eq("school_id", schoolId)
        .eq("academic_year_id", year.id)
        .in("class_group_id", groupIds)
        .in("status", CURRENT)
    : { data: [] as Row[], error: null };
  if (enrollmentError)
    throw publicDatabaseError(enrollmentError, "Não foi possível ler as matrículas.");
  const enrollmentRows = (enrollments ?? []) as Row[];
  const enrollmentIds = enrollmentRows.map((row) => str(row.id));
  const studentIds = [...new Set(enrollmentRows.map((row) => str(row.student_id)))];

  const { data: students } = studentIds.length
    ? await db
        .from("students")
        .select("id, person_id, student_number")
        .eq("school_id", schoolId)
        .in("id", studentIds)
    : { data: [] as Row[] };
  const personIds = ((students ?? []) as Row[]).map((row) => str(row.person_id));
  const { data: people } = personIds.length
    ? await db
        .from("people")
        .select("id, full_name, date_of_birth")
        .eq("school_id", schoolId)
        .in("id", personIds)
    : { data: [] as Row[] };

  // Quem já tem registos nesta matrícula (qualquer tabela chega).
  const withRecords = new Set<string>();
  if (enrollmentIds.length) {
    const [byEnrollment, attended] = await Promise.all([
      Promise.all(
        RECORD_TABLES.map((table) =>
          idsWithRows(
            (remaining) =>
              db
                .from(table)
                .select("enrollment_id")
                .eq("school_id", schoolId)
                .in("enrollment_id", remaining)
                .limit(RECORD_PAGE),
            "enrollment_id",
            enrollmentIds,
          ),
        ),
      ),
      // A chamada actual guarda o aluno e a sessão, não a matrícula: conta a presença
      // numa aula de uma das turmas desta classe e turno.
      idsWithRows(
        (remaining) =>
          db
            .from("siga_attendance_records")
            .select("student_id, siga_attendance_sessions!inner(class_group_id)")
            .eq("school_id", schoolId)
            .in("student_id", remaining)
            .in("siga_attendance_sessions.class_group_id", groupIds)
            .limit(RECORD_PAGE),
        "student_id",
        studentIds,
      ),
    ]);
    for (const ids of byEnrollment) for (const id of ids) withRecords.add(id);
    for (const row of enrollmentRows) {
      if (attended.has(str(row.student_id))) withRecords.add(str(row.id));
    }
  }

  const studentOf = new Map(((students ?? []) as Row[]).map((row) => [str(row.id), row]));
  const personOf = new Map(((people ?? []) as Row[]).map((row) => [str(row.id), row]));
  const plan = buildOrganizationPlan({
    scope: {
      schoolId,
      academicYearId: year.id,
      gradeLevelId: input.gradeLevelId,
      programId: level.program_id ? str(level.program_id) : null,
      shift: input.shift,
    },
    referenceDate: todayInLuanda(),
    classes,
    students: enrollmentRows.map((row) => {
      const student = studentOf.get(str(row.student_id));
      const person = personOf.get(str(student?.person_id));
      return {
        enrollmentId: str(row.id),
        studentId: str(row.student_id),
        studentNumber: str(student?.student_number),
        name: str(person?.full_name) || "—",
        birthDate: person?.date_of_birth ? str(person.date_of_birth).slice(0, 10) : null,
        classGroupId: str(row.class_group_id),
        hasRecords: withRecords.has(str(row.id)),
      };
    }),
  });
  const counts = new Map<string, number>();
  for (const row of enrollmentRows) {
    const id = str(row.class_group_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    plan,
    yearId: year.id,
    counts,
    capacity: new Map(classes.map((group) => [group.id, group.capacity])),
  };
}

export const previewClassOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => scopeInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor(
      "pessoas",
      context.supabase,
      context.userId,
      MANAGE_ROLES,
    );
    const db = await loadSgaAdminClient();
    const { plan } = await loadPlan(db, membership.schoolId, data);
    return plan;
  });

export const applyClassOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scopeInput.extend({ signature: z.string().regex(/^[0-9a-f]{8}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pessoas",
      context.supabase,
      context.userId,
      MANAGE_ROLES,
    );
    // Mudar de turma exige 2FA (placeStudentInClass): recusa-se logo, não aluno a aluno.
    const hasAal2 = context.claims?.["aal"] === "aal2";
    if (!hasAal2) throw new Error(ENROLLMENT_2FA_MESSAGE);
    const db = await loadSgaAdminClient();
    const { plan, yearId, counts, capacity } = await loadPlan(db, membership.schoolId, data);
    if (plan.blockers.length) throw new Error(plan.blockers[0]);
    if (plan.signature !== data.signature) {
      throw new Error(
        "As turmas mudaram desde a pré-visualização (matrículas, notas ou lotação). Reveja a proposta e aplique de novo.",
      );
    }
    const { ordered, blocked } = orderMoves(plan.moves, counts, capacity);
    const moved: string[] = [];
    const failed: Array<{ studentId: string; message: string }> = [];
    for (const move of ordered) {
      try {
        await placeStudentInClass(db, context.supabase, {
          schoolId: membership.schoolId,
          studentId: move.studentId,
          classGroupId: move.to,
          academicYearId: yearId,
          userId: context.userId,
          hasAal2,
        });
        moved.push(move.studentId);
      } catch (error) {
        failed.push({
          studentId: move.studentId,
          message: error instanceof Error ? error.message : "Falha ao mudar de turma.",
        });
      }
    }
    await recordAccessAudit({
      schoolId: membership.schoolId,
      actorUserId: context.userId,
      action: "academic.classes_organized_by_age",
      entityType: "grade_level",
      entityId: data.gradeLevelId,
      metadata: {
        shift: data.shift,
        academic_year_id: yearId,
        moved: moved.length,
        failed: failed.length,
        blocked: blocked.length,
      },
    });
    return {
      moved: moved.length,
      failed,
      blocked: blocked.map((move) => move.studentId),
    };
  });
