/**
 * Resultado final do ano por turma e registo no histórico académico.
 *
 * Parte da pauta anual oficial (homologada, publicada ou fechada), aplica as
 * notas de exame (a época mais recente com nota, por disciplina) e calcula a
 * situação com a regra da pauta. "Registar no histórico" grava em
 * `student_academic_history` (um registo por aluno, ano e classe — repetir
 * actualiza) e a média em `enrollments.final_average`.
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
  FINAL_OUTCOME_LABELS,
  applyExamResults,
  computeFinalResult,
  latestGradedBySubject,
  subjectFinalsFromBreakdown,
  type FinalResult,
  type SubjectFinal,
} from "./exam-engine";
import { recordAuditBatch } from "@/features/audit/record-audit";
import { OFFICIAL_SHEET_STATUSES, activeYearId, loadAnnualSheet, studentNames } from "./exam-data";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

const READ_ROLES = ["Administrador", "Secretaria", "Professor"] as const;
const MANAGE_ROLES = ["Administrador", "Secretaria"] as const;

export type FinalResultLine = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  before: FinalResult;
  after: FinalResult;
  examSubjects: number;
  /** Nota final de cada disciplina, já com os exames. */
  subjects: SubjectFinal[];
  absencePercentage: number | null;
  recorded: { outcome: string | null; finalAverage: number | null } | null;
};

export type ClassFinalResults = {
  yearLabel: string | null;
  gradeLevel: string | null;
  sheet: { status: string; official: boolean } | null;
  hasRule: boolean;
  students: FinalResultLine[];
  canManage: boolean;
};

type Context = {
  yearId: string;
  yearLabel: string;
  gradeLevel: string;
  sheet: Awaited<ReturnType<typeof loadAnnualSheet>>;
  lines: FinalResultLine[];
};

async function buildClassFinalResults(
  db: Db,
  schoolId: string,
  classGroupId: string,
  requestedYearId?: string,
): Promise<Context | null> {
  const { data: group } = await db
    .from("class_groups")
    .select("id, name, academic_year_id, grade_level_id")
    .eq("school_id", schoolId)
    .eq("id", classGroupId)
    .maybeSingle();
  if (!group) throw new Error("Turma não encontrada nesta escola.");
  const yearId =
    (group.academic_year_id ? str(group.academic_year_id) : null) ??
    (await activeYearId(db, schoolId, requestedYearId));
  if (!yearId) return null;

  const [{ data: year }, { data: level }] = await Promise.all([
    db
      .from("academic_years")
      .select("name")
      .eq("school_id", schoolId)
      .eq("id", yearId)
      .maybeSingle(),
    group.grade_level_id
      ? db
          .from("grade_levels")
          .select("name")
          .eq("school_id", schoolId)
          .eq("id", str(group.grade_level_id))
          .maybeSingle()
      : Promise.resolve({ data: null as Row | null }),
  ]);
  const yearLabel = str(year?.name) || "Ano lectivo";
  const gradeLevel = str(level?.name) || str(group.name);

  const sheet = await loadAnnualSheet(db, schoolId, yearId, classGroupId);
  if (!sheet || !sheet.rule) return { yearId, yearLabel, gradeLevel, sheet, lines: [] };
  const rule = sheet.rule;

  // Notas de exame de todas as épocas do ano para esta turma (a tabela pode
  // ainda não existir: sem exames, o resultado é o da pauta).
  const { data: sessions, error: sessionsError } = await db
    .from("siga_exam_sessions")
    .select("id, created_at")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId);
  const sessionAt = new Map(((sessions ?? []) as Row[]).map((s) => [str(s.id), str(s.created_at)]));
  const { data: regs } =
    !sessionsError && sessionAt.size
      ? await db
          .from("siga_exam_registrations")
          .select("session_id, enrollment_id, subject_id, status, final_average")
          .eq("school_id", schoolId)
          .eq("class_group_id", classGroupId)
          .in("session_id", [...sessionAt.keys()])
      : { data: [] as Row[] };

  const enrollmentIds = sheet.rows.map((r) => r.enrollmentId);
  const names = await studentNames(db, schoolId, enrollmentIds);
  const studentIds = [...new Set([...names.values()].map((n) => n.studentId))];
  const { data: history } = studentIds.length
    ? await db
        .from("student_academic_history")
        .select("student_id, outcome, final_average")
        .eq("school_id", schoolId)
        .eq("academic_year_label", yearLabel)
        .eq("grade_level", gradeLevel)
        .in("student_id", studentIds)
    : { data: [] as Row[] };
  const recordedBy = new Map(((history ?? []) as Row[]).map((h) => [str(h.student_id), h]));

  const lines = sheet.rows.map((row): FinalResultLine => {
    const subjects = subjectFinalsFromBreakdown(row.breakdown, rule);
    const graded = latestGradedBySubject(
      ((regs ?? []) as Row[])
        .filter((r) => str(r.enrollment_id) === row.enrollmentId)
        .map((r) => ({
          subjectId: str(r.subject_id),
          status: str(r.status),
          finalAverage: numOrNull(r.final_average),
          sessionCreatedAt: sessionAt.get(str(r.session_id)) ?? "",
        })),
    );
    const who = names.get(row.enrollmentId);
    const recorded = who ? recordedBy.get(who.studentId) : undefined;
    const finals = applyExamResults(subjects, graded);
    return {
      enrollmentId: row.enrollmentId,
      studentId: who?.studentId ?? "",
      studentName: who?.name ?? "Aluno",
      before: computeFinalResult(subjects, row.absencePercentage, rule),
      after: computeFinalResult(finals, row.absencePercentage, rule),
      examSubjects: graded.length,
      subjects: finals,
      absencePercentage: row.absencePercentage,
      recorded: recorded
        ? {
            outcome: recorded.outcome ? str(recorded.outcome) : null,
            finalAverage: numOrNull(recorded.final_average),
          }
        : null,
    };
  });
  lines.sort((a, b) => a.studentName.localeCompare(b.studentName, "pt"));
  return { yearId, yearLabel, gradeLevel, sheet, lines };
}

const classInput = z.object({
  classGroupId: z.string().uuid(),
  academicYearId: z.string().uuid().optional(),
});

export const getClassFinalResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => classInput.parse(input))
  .handler(async ({ data, context }): Promise<ClassFinalResults> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const canManage = membership.allAppRoles.some((r) =>
      (MANAGE_ROLES as readonly string[]).includes(r),
    );
    const ctx = await buildClassFinalResults(
      db,
      membership.schoolId,
      data.classGroupId,
      data.academicYearId,
    );
    return {
      yearLabel: ctx?.yearLabel ?? null,
      gradeLevel: ctx?.gradeLevel ?? null,
      sheet: ctx?.sheet
        ? { status: ctx.sheet.status, official: OFFICIAL_SHEET_STATUSES.includes(ctx.sheet.status) }
        : null,
      hasRule: Boolean(ctx?.sheet?.rule),
      students: ctx?.lines ?? [],
      canManage,
    };
  });

export const recordClassFinalResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => classInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const ctx = await buildClassFinalResults(db, schoolId, data.classGroupId, data.academicYearId);
    if (!ctx?.sheet || !OFFICIAL_SHEET_STATUSES.includes(ctx.sheet.status)) {
      throw new Error("A pauta anual tem de estar homologada antes de registar no histórico.");
    }
    if (!ctx.sheet.rule) throw new Error("A pauta anual não tem regra de avaliação.");

    // Épocas ainda abertas: o resultado pode mudar; não se regista a meio.
    const { data: openSessions } = await db
      .from("siga_exam_sessions")
      .select("id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", ctx.yearId)
      .eq("status", "open")
      .limit(1);
    if (openSessions?.length) {
      throw new Error("Há uma época de exames aberta. Feche-a antes de registar no histórico.");
    }

    const lines = ctx.lines.filter((l) => l.studentId && l.after.result !== "incomplete");
    if (!lines.length) return { recorded: 0, skipped: ctx.lines.length };

    const rows = lines.map((l) => ({
      school_id: schoolId,
      student_id: l.studentId,
      academic_year_label: ctx.yearLabel,
      grade_level: ctx.gradeLevel,
      final_average: l.after.average,
      outcome: FINAL_OUTCOME_LABELS[l.after.result],
      notes:
        l.examSubjects > 0
          ? `Pauta anual e ${l.examSubjects} exame(s).${l.after.reason ? ` ${l.after.reason}.` : ""}`
          : `Pauta anual.${l.after.reason ? ` ${l.after.reason}.` : ""}`,
      created_by: context.userId,
      enrollment_id: l.enrollmentId,
      grade_sheet_id: ctx.sheet!.id,
      subject_results: l.subjects.map((subject) => ({
        subjectId: subject.subjectId,
        subject: subject.subjectName,
        final: subject.average,
        isKeySubject: subject.isKeySubject,
      })),
      absence_percentage: l.absencePercentage,
    }));
    // Actualiza o registo do ano e classe se existir; senão, cria. Sem depender
    // do índice único (vem de uma migração Lovable que pode não estar aplicada).
    const { data: existing, error: existingError } = await db
      .from("student_academic_history")
      .select("id, student_id, outcome, final_average")
      .eq("school_id", schoolId)
      .eq("academic_year_label", ctx.yearLabel)
      .eq("grade_level", ctx.gradeLevel)
      .in(
        "student_id",
        rows.map((r) => r.student_id),
      );
    if (existingError) {
      throw publicDatabaseError(existingError, "Não foi possível ler o histórico académico.");
    }
    const existingId = new Map(
      ((existing ?? []) as Row[]).map((e) => [str(e.student_id), str(e.id)]),
    );
    const inserts = rows.filter((r) => !existingId.has(r.student_id));
    if (inserts.length) {
      const { error } = await db.from("student_academic_history").insert(inserts);
      if (error) {
        throw publicDatabaseError(error, "Não foi possível registar no histórico académico.");
      }
    }
    const previous = new Map(((existing ?? []) as Row[]).map((e) => [str(e.student_id), e]));
    const rectified: Parameters<typeof recordAuditBatch>[0] = [];
    for (const r of rows.filter((row) => existingId.has(row.student_id))) {
      const before = previous.get(r.student_id);
      const beforeAverage = numOrNull(before?.final_average);
      if (str(before?.outcome) !== str(r.outcome) || beforeAverage !== r.final_average) {
        rectified.push({
          schoolId,
          actorUserId: context.userId,
          action: "student_academic_history.rectified",
          entityType: "student_academic_history",
          entityId: existingId.get(r.student_id)!,
          metadata: {
            before: { outcome: before?.outcome ?? null, final_average: beforeAverage },
            after: { outcome: r.outcome, final_average: r.final_average },
            grade_sheet_id: r.grade_sheet_id,
          },
        });
      }
      const { error } = await db
        .from("student_academic_history")
        .update({
          final_average: r.final_average,
          outcome: r.outcome,
          notes: r.notes,
          enrollment_id: r.enrollment_id,
          grade_sheet_id: r.grade_sheet_id,
          subject_results: r.subject_results,
          absence_percentage: r.absence_percentage,
          updated_by: context.userId,
        })
        .eq("school_id", schoolId)
        .eq("id", existingId.get(r.student_id)!);
      if (error) {
        throw publicDatabaseError(error, "Não foi possível actualizar o histórico académico.");
      }
    }

    for (const l of lines) {
      if (l.after.average == null) continue;
      await db
        .from("enrollments")
        .update({ final_average: l.after.average, updated_by: context.userId })
        .eq("school_id", schoolId)
        .eq("id", l.enrollmentId);
    }
    // Rectificações: o valor anterior fica no registo de auditoria.
    await recordAuditBatch(rectified);
    return {
      recorded: rows.length,
      rectified: rectified.length,
      skipped: ctx.lines.length - rows.length,
    };
  });
