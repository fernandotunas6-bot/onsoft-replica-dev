/**
 * Pautas oficiais (grade_sheets): quadro do ano, detalhe com pré-pauta e as
 * acções do fluxo. Gerar e mudar de estado usam as funções da base com a
 * sessão do utilizador (build_grade_sheet, transition_grade_sheet), que
 * aplicam as permissões e o 2FA. Leituras com a chave de serviço, só para o
 * pessoal da escola.
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
import { sgaClient } from "@/integrations/supabase/sga";
import {
  GRADE_SHEET_STATUSES,
  buildPrePautaChecks,
  canRebuildGradeSheet,
  type GradeSheetStatus,
  type PrePautaCheck,
  type PrePautaSubject,
} from "./grade-sheet-workflow";
import { insertInAppNotifications, resolveClassAudience } from "./lesson-delivery";
import { absenceByEnrollment } from "./exam-data";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const READ_ROLES = ["Administrador", "Secretaria", "Professor"] as const;
const MANAGE_ROLES = ["Administrador", "Secretaria"] as const;

export type GradeSheetBoard = {
  terms: Array<{ id: string; name: string; sequence: number }>;
  classGroups: Array<{ id: string; name: string }>;
  sheets: Array<{
    id: string;
    classGroupId: string;
    termId: string | null;
    kind: "term" | "annual";
    status: GradeSheetStatus;
    updatedAt: string;
  }>;
};

const boardInput = z.object({ academicYearId: z.string().uuid().optional() });

export const getGradeSheetBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => boardInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<GradeSheetBoard> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    let yearId = data.academicYearId ?? null;
    if (!yearId) {
      const { data: year } = await db
        .from("academic_years")
        .select("id")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      yearId = year?.id ? String(year.id) : null;
    }
    if (!yearId) return { terms: [], classGroups: [], sheets: [] };
    const [{ data: terms }, { data: groups }, { data: sheets, error }] = await Promise.all([
      db
        .from("terms")
        .select("id, name, sequence")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .order("sequence"),
      db
        .from("class_groups")
        .select("id, name")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .order("name"),
      db
        .from("grade_sheets")
        .select("id, class_group_id, term_id, kind, status, updated_at")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId),
    ]);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as pautas.");
    return {
      terms: (terms ?? []).map((t) => ({
        id: str(t.id),
        name: str(t.name) || `${t.sequence}.º período`,
        sequence: Number(t.sequence),
      })),
      classGroups: (groups ?? []).map((g) => ({ id: str(g.id), name: str(g.name) })),
      sheets: (sheets ?? []).map((s) => ({
        id: str(s.id),
        classGroupId: str(s.class_group_id),
        termId: s.term_id ? str(s.term_id) : null,
        kind: s.kind === "annual" ? "annual" : "term",
        status: (GRADE_SHEET_STATUSES as readonly string[]).includes(str(s.status))
          ? (s.status as GradeSheetStatus)
          : "draft",
        updatedAt: str(s.updated_at),
      })),
    };
  });

export type GradeSheetDetail = {
  id: string;
  classGroupId: string;
  termId: string | null;
  title: string;
  kind: "term" | "annual";
  status: GradeSheetStatus;
  reopenReason: string | null;
  dates: {
    submitted: string | null;
    homologated: string | null;
    published: string | null;
    closed: string | null;
  };
  rows: Array<{
    enrollmentId: string;
    studentName: string;
    continuous: number | null;
    exam: number | null;
    average: number | null;
    absencePct: number | null;
    result: string;
    subjects: Array<{ subject: string; subjectId: string; average: number | null }>;
  }>;
  checks: PrePautaCheck[];
};

/** Dados da pré-pauta de uma turma num período (ou no ano, pauta anual). */
async function loadPrePauta(
  db: Db,
  schoolId: string,
  classGroupId: string,
  termId: string | null,
): Promise<PrePautaCheck[]> {
  const [{ data: cs }, { count: enrolled }, { data: rule }, { data: enrollments }] =
    await Promise.all([
      db
        .from("class_subjects")
        .select("id, subject_id, teacher_id")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .eq("status", "active"),
      db
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .in("status", ["active", "pending"]),
      db
        .from("assessment_rule_sets")
        .select("id")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .eq("code", "DEFAULT")
        .limit(1)
        .maybeSingle(),
      db
        .from("enrollments")
        .select("id")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .in("status", ["active", "pending"]),
    ]);
  const csRows = (cs ?? []) as Row[];
  const enrollmentIds = (enrollments ?? []).map((e) => str(e.id));
  const subjectIds = [...new Set(csRows.map((c) => str(c["subject_id"])))];
  let gradebookQuery = db
    .from("gradebooks")
    .select("id, class_subject_id, status")
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId);
  if (termId) gradebookQuery = gradebookQuery.eq("term_id", termId);
  const [{ data: subjects }, { data: gradebooks }] = await Promise.all([
    subjectIds.length
      ? db.from("subjects").select("id, name").in("id", subjectIds)
      : Promise.resolve({ data: [] as Row[] }),
    gradebookQuery,
  ]);
  const books = (gradebooks ?? []) as Row[];
  const { data: items } = books.length
    ? await db
        .from("grade_items")
        .select("id, code, gradebook_id")
        .in(
          "gradebook_id",
          books.map((b) => str(b["id"])),
        )
    : { data: [] as Row[] };
  const itemRows = (items ?? []) as Row[];
  const { data: scores } =
    itemRows.length && enrollmentIds.length
      ? await db
          .from("grade_scores")
          .select("grade_item_id, enrollment_id, score, pending_score")
          .eq("school_id", schoolId)
          .in(
            "grade_item_id",
            itemRows.map((i) => str(i["id"])),
          )
          .in("enrollment_id", enrollmentIds)
          .neq("status", "reversed")
      : { data: [] as Row[] };

  const subjectName = new Map(
    ((subjects ?? []) as Row[]).map((s) => [str(s["id"]), str(s["name"])]),
  );
  const bookByCs = new Map<string, Row[]>();
  for (const b of books)
    bookByCs.set(str(b["class_subject_id"]), [
      ...(bookByCs.get(str(b["class_subject_id"])) ?? []),
      b,
    ]);
  const scoresByItem = new Map<string, Row[]>();
  for (const s of (scores ?? []) as Row[]) {
    const id = str(s["grade_item_id"]);
    scoresByItem.set(id, [...(scoresByItem.get(id) ?? []), s]);
  }
  const perSubject: PrePautaSubject[] = csRows.map((c) => {
    const csBooks = bookByCs.get(str(c["id"])) ?? [];
    const bookIds = new Set(csBooks.map((b) => str(b["id"])));
    const csItems = itemRows.filter((i) => bookIds.has(str(i["gradebook_id"])));
    const scoredFor = (code: string) => {
      const scored = new Set<string>();
      for (const item of csItems.filter((i) => str(i["code"]).toUpperCase() === code)) {
        for (const s of scoresByItem.get(str(item["id"])) ?? []) {
          if (s["score"] != null) scored.add(str(s["enrollment_id"]));
        }
      }
      return scored.size;
    };
    const allScores = csItems.flatMap((i) => scoresByItem.get(str(i["id"])) ?? []);
    const statuses = csBooks.map((b) => str(b["status"]));
    return {
      subjectName: subjectName.get(str(c["subject_id"])) || "Disciplina",
      hasTeacher: Boolean(c["teacher_id"]),
      // Pauta anual: o pior estado entre os períodos.
      gradebookStatus: statuses.length
        ? (["draft", "open", "submitted", "closed"].find((s) => statuses.includes(s)) ?? null)
        : null,
      missingMac: Math.max(0, enrollmentIds.length - scoredFor("MAC")),
      missingNpt: Math.max(0, enrollmentIds.length - scoredFor("NPT")),
      outOfScale: allScores.filter(
        (s) => s["score"] != null && (Number(s["score"]) < 0 || Number(s["score"]) > 20),
      ).length,
      pendingChanges: allScores.filter((s) => s["pending_score"] != null).length,
    };
  });
  return buildPrePautaChecks({
    enrolled: enrolled ?? 0,
    hasActiveRule: Boolean(rule?.id),
    subjects: perSubject,
  });
}

const detailInput = z.object({ sheetId: z.string().uuid() });

export const getGradeSheetDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => detailInput.parse(input))
  .handler(async ({ data, context }): Promise<GradeSheetDetail> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: sheet } = await db
      .from("grade_sheets")
      .select("*")
      .eq("school_id", schoolId)
      .eq("id", data.sheetId)
      .maybeSingle();
    if (!sheet) throw new Error("Pauta não encontrada.");
    const { data: rows } = await db
      .from("grade_sheet_rows")
      .select(
        "enrollment_id, continuous_average, exam_average, term_average, absence_percentage, result, subject_breakdown",
      )
      .eq("school_id", schoolId)
      .eq("grade_sheet_id", data.sheetId);
    const enrollmentIds = (rows ?? []).map((r) => str(r.enrollment_id));
    // Faltas reais da chamada do SIGA (a base calcula-as numa tabela que o SIGA não usa).
    const absences = await absenceByEnrollment(
      db,
      schoolId,
      str(sheet.academic_year_id),
      str(sheet.class_group_id),
      enrollmentIds,
    );
    const { data: enrollments } = enrollmentIds.length
      ? await db.from("enrollments").select("id, student_id").in("id", enrollmentIds)
      : { data: [] as Row[] };
    const studentIds = (enrollments ?? []).map((e) => str(e.student_id));
    const { data: students } = studentIds.length
      ? await db.from("students").select("id, person_id").in("id", studentIds)
      : { data: [] as Row[] };
    const personIds = (students ?? []).map((s) => str(s.person_id));
    const { data: people } = personIds.length
      ? await db.from("people").select("id, full_name").in("id", personIds)
      : { data: [] as Row[] };
    const nameByPerson = new Map((people ?? []).map((p) => [str(p.id), str(p.full_name)]));
    const personByStudent = new Map((students ?? []).map((s) => [str(s.id), str(s.person_id)]));
    const studentByEnrollment = new Map(
      (enrollments ?? []).map((e) => [str(e.id), str(e.student_id)]),
    );

    const checks = await loadPrePauta(
      db,
      schoolId,
      str(sheet.class_group_id),
      sheet.kind === "term" ? str(sheet.term_id) : null,
    );
    return {
      id: str(sheet.id),
      classGroupId: str(sheet.class_group_id),
      termId: sheet.term_id ? str(sheet.term_id) : null,
      title: str(sheet.title) || "Pauta",
      kind: sheet.kind === "annual" ? "annual" : "term",
      status: sheet.status as GradeSheetStatus,
      reopenReason: sheet.reopen_reason ? str(sheet.reopen_reason) : null,
      dates: {
        submitted: sheet.submitted_at ? str(sheet.submitted_at) : null,
        homologated: sheet.homologated_at ? str(sheet.homologated_at) : null,
        published: sheet.published_at ? str(sheet.published_at) : null,
        closed: sheet.closed_at ? str(sheet.closed_at) : null,
      },
      rows: (rows ?? [])
        .map((r) => ({
          enrollmentId: str(r.enrollment_id),
          studentName:
            nameByPerson.get(
              personByStudent.get(studentByEnrollment.get(str(r.enrollment_id)) ?? "") ?? "",
            ) || "Aluno",
          continuous: num(r.continuous_average),
          exam: num(r.exam_average),
          average: num(r.term_average),
          absencePct: absences.has(str(r.enrollment_id))
            ? absences.get(str(r.enrollment_id))!
            : num(r.absence_percentage),
          result: str(r.result),
          subjects: (Array.isArray(r.subject_breakdown) ? (r.subject_breakdown as Row[]) : []).map(
            (b) => ({
              subject: str(b["subject"]),
              subjectId: str(b["subjectId"]),
              average: num(b["average"]),
            }),
          ),
        }))
        .sort((a, b) => a.studentName.localeCompare(b.studentName, "pt")),
      checks,
    };
  });

const buildInput = z.object({
  classGroupId: z.string().uuid(),
  termId: z.string().uuid().nullable(),
  kind: z.enum(["term", "annual"]),
});

/** Gerar ou recalcular (volta a rascunho). Recusa pautas homologadas, publicadas ou fechadas. */
export const buildGradeSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => buildInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    if (data.kind === "term" && !data.termId) throw new Error("Escolha o período.");
    const db = await loadSgaAdminClient();
    let existingQuery = db
      .from("grade_sheets")
      .select("status")
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", data.classGroupId)
      .eq("kind", data.kind);
    if (data.kind === "term") existingQuery = existingQuery.eq("term_id", data.termId!);
    const { data: existing } = await existingQuery.limit(1).maybeSingle();
    if (existing && !canRebuildGradeSheet(existing.status as GradeSheetStatus)) {
      throw new Error(
        "Esta pauta já foi homologada ou publicada: não se recalcula. Reabra-a para rectificação primeiro.",
      );
    }
    const { data: result, error } = await sgaClient(context.supabase).rpc("build_grade_sheet", {
      school_id: membership.schoolId,
      class_group_id: data.classGroupId,
      term_id: data.termId,
      kind: data.kind,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível gerar a pauta.");
    return result as { gradeSheetId: string; status: string };
  });

const transitionInput = z.object({
  sheetId: z.string().uuid(),
  status: z.enum(GRADE_SHEET_STATUSES),
  reason: z.string().trim().max(1000).optional(),
});

export const transitionGradeSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => transitionInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...READ_ROLES],
    );
    const { error } = await sgaClient(context.supabase).rpc("transition_grade_sheet", {
      school_id: membership.schoolId,
      grade_sheet_id: data.sheetId,
      status: data.status,
      reason: data.reason ?? null,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível mudar o estado da pauta.");

    let notified = 0;
    if (data.status === "published") {
      // Pauta publicada: avisar alunos e encarregados da turma.
      const db = await loadSgaAdminClient();
      const { data: sheet } = await db
        .from("grade_sheets")
        .select("class_group_id, title")
        .eq("id", data.sheetId)
        .maybeSingle();
      if (sheet?.class_group_id) {
        const audience = await resolveClassAudience(
          db,
          membership.schoolId,
          [str(sheet.class_group_id)],
          {
            teachers: true,
            students: true,
            guardians: true,
          },
        );
        const seen = new Set<string>();
        notified = await insertInAppNotifications(
          db,
          membership.schoolId,
          audience
            .filter((r) => r.userId && !seen.has(r.userId) && seen.add(r.userId))
            .map((r) => ({
              userId: r.userId!,
              eventType: "academic.grade_sheet.published",
              title: `${str(sheet.title) || "Pauta"} publicada`,
              body:
                r.role === "teacher"
                  ? "A pauta foi homologada e publicada. Alterações só por rectificação."
                  : "As notas oficiais do período já estão disponíveis no portal.",
              payload: { sheetId: data.sheetId },
            })),
        ).catch(() => 0);
      }
    }
    return { ok: true, notified };
  });
