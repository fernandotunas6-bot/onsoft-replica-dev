/**
 * Pedidos de alteração de nota depois de a pauta ser oficial.
 *
 * Fluxo: professor (da disciplina) ou coordenação pede → fica em
 * grade_scores.pending_* → coordenação aprova ou recusa → histórico em
 * grade_score_history (anterior, novo, motivo, quem pediu, quem aprovou) e
 * aviso a quem pediu. Aprovar exige a pauta reaberta para rectificação, para
 * a pauta oficial nunca divergir das notas.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import { insertInAppNotifications } from "./lesson-delivery";
import { LOCKED_SHEET_STATUSES } from "./sga-grades";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const isMissing = (m?: string) => /schema cache|does not exist|42P01|PGRST205/i.test(m ?? "");

export const GRADE_COMPONENTS = ["MAC", "NPP", "NPT"] as const;

async function ownTeacherId(db: Db, schoolId: string, userId: string) {
  const { data } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

const requestInput = z.object({
  sheetId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  component: z.enum(GRADE_COMPONENTS),
  newScore: z.number().min(0).max(20),
  reason: z.string().trim().min(5, "Indique o motivo (pelo menos 5 caracteres).").max(500),
});

export const requestGradeChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => requestInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: sheet } = await db
      .from("grade_sheets")
      .select("id, class_group_id, term_id, kind")
      .eq("school_id", schoolId)
      .eq("id", data.sheetId)
      .maybeSingle();
    if (!sheet?.term_id) throw new Error("Escolha a pauta do período para pedir a alteração.");
    const { data: cs } = await db
      .from("class_subjects")
      .select("id, teacher_id")
      .eq("school_id", schoolId)
      .eq("class_group_id", sheet.class_group_id)
      .eq("subject_id", data.subjectId)
      .maybeSingle();
    if (!cs) throw new Error("Esta disciplina não pertence à turma da pauta.");
    const roles: string[] = membership.allAppRoles ?? [membership.appRole];
    if (!roles.some((r) => r === "Administrador" || r === "Secretaria")) {
      if ((await ownTeacherId(db, schoolId, context.userId)) !== str(cs.teacher_id)) {
        throw new Error(
          "Só o professor da disciplina (ou a coordenação) pode pedir esta alteração.",
        );
      }
    }
    const { data: book } = await db
      .from("gradebooks")
      .select("id")
      .eq("school_id", schoolId)
      .eq("class_subject_id", cs.id)
      .eq("term_id", sheet.term_id)
      .maybeSingle();
    const { data: item } = book
      ? await db
          .from("grade_items")
          .select("id")
          .eq("gradebook_id", book.id)
          .eq("code", data.component)
          .maybeSingle()
      : { data: null };
    const { data: score } = item
      ? await db
          .from("grade_scores")
          .select("id, score, pending_score")
          .eq("school_id", schoolId)
          .eq("grade_item_id", item.id)
          .eq("enrollment_id", data.enrollmentId)
          .maybeSingle()
      : { data: null };
    if (!score) throw new Error("Não há nota lançada neste componente para este aluno.");
    if (score.pending_score != null)
      throw new Error("Já existe um pedido pendente para esta nota.");
    if (Number(score.score) === data.newScore) throw new Error("A nota pedida é igual à actual.");
    // Só regista se continuar sem pedido pendente: dois pedidos em simultâneo
    // não se sobrepõem (o segundo recebe o aviso de pedido pendente).
    const { data: claimed, error } = await db
      .from("grade_scores")
      .update({
        pending_score: data.newScore,
        pending_reason: data.reason,
        pending_requested_by: context.userId,
        pending_requested_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("school_id", schoolId)
      .eq("id", score.id)
      .is("pending_score", null)
      .select("id");
    if (error) throw publicDatabaseError(error, "Não foi possível registar o pedido.");
    if (!claimed?.length) throw new Error("Já existe um pedido pendente para esta nota.");
    return { ok: true };
  });

export type GradeChangeRequest = {
  gradeScoreId: string;
  studentName: string;
  className: string;
  subjectName: string;
  component: string;
  term: number | null;
  current: number | null;
  requested: number;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  /** Estado da pauta do período: aprovar só com "rectified" ou sem pauta oficial. */
  sheetStatus: string | null;
};

export const listGradeChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: GradeChangeRequest[] }> => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: scores } = await db
      .from("grade_scores")
      .select(
        "id, grade_item_id, enrollment_id, score, pending_score, pending_reason, pending_requested_by, pending_requested_at",
      )
      .eq("school_id", schoolId)
      .not("pending_score", "is", null)
      .order("pending_requested_at", { ascending: true })
      .limit(200);
    const rows = (scores ?? []) as Row[];
    if (!rows.length) return { items: [] };
    const ids = (key: string, list: Row[]) => [
      ...new Set(list.map((r) => str(r[key])).filter(Boolean)),
    ];
    const { data: items } = await db
      .from("grade_items")
      .select("id, code, gradebook_id")
      .in("id", ids("grade_item_id", rows));
    const { data: books } = await db
      .from("gradebooks")
      .select("id, class_subject_id, class_group_id, term_id")
      .in("id", ids("gradebook_id", (items ?? []) as Row[]));
    const bookRows = (books ?? []) as Row[];
    const [
      { data: cs },
      { data: groups },
      { data: terms },
      { data: enrollments },
      { data: sheets },
    ] = await Promise.all([
      db
        .from("class_subjects")
        .select("id, subject_id")
        .in("id", ids("class_subject_id", bookRows)),
      db.from("class_groups").select("id, name").in("id", ids("class_group_id", bookRows)),
      db.from("terms").select("id, sequence").in("id", ids("term_id", bookRows)),
      db.from("enrollments").select("id, student_id").in("id", ids("enrollment_id", rows)),
      db
        .from("grade_sheets")
        .select("class_group_id, term_id, status")
        .eq("school_id", schoolId)
        .eq("kind", "term")
        .in("class_group_id", ids("class_group_id", bookRows)),
    ]);
    const [{ data: subjects }, { data: students }] = await Promise.all([
      db
        .from("subjects")
        .select("id, name")
        .in("id", ids("subject_id", (cs ?? []) as Row[])),
      db
        .from("students")
        .select("id, person_id")
        .in("id", ids("student_id", (enrollments ?? []) as Row[])),
    ]);
    const requesterIds = ids("pending_requested_by", rows);
    const [{ data: people }, { data: requesters }] = await Promise.all([
      db
        .from("people")
        .select("id, full_name")
        .in("id", ids("person_id", (students ?? []) as Row[])),
      db
        .from("people")
        .select("user_id, full_name")
        .eq("school_id", schoolId)
        .in("user_id", requesterIds),
    ]);
    const map = (list: unknown, key = "id") =>
      new Map(((list ?? []) as Row[]).map((r) => [str(r[key]), r]));
    const itemById = map(items);
    const bookById = map(books);
    const csById = map(cs);
    const groupById = map(groups);
    const termById = map(terms);
    const enrollmentById = map(enrollments);
    const subjectById = map(subjects);
    const studentById = map(students);
    const personById = map(people);
    const requesterByUser = map(requesters, "user_id");
    return {
      items: rows.map((r) => {
        const item = itemById.get(str(r["grade_item_id"]));
        const book = item ? bookById.get(str(item["gradebook_id"])) : undefined;
        const classSubject = book ? csById.get(str(book["class_subject_id"])) : undefined;
        const student = studentById.get(
          str(enrollmentById.get(str(r["enrollment_id"]))?.["student_id"]),
        );
        const sheet = ((sheets ?? []) as Row[]).find(
          (s) =>
            str(s["class_group_id"]) === str(book?.["class_group_id"]) &&
            str(s["term_id"]) === str(book?.["term_id"]),
        );
        return {
          gradeScoreId: str(r["id"]),
          studentName: str(personById.get(str(student?.["person_id"]))?.["full_name"]) || "Aluno",
          className: str(groupById.get(str(book?.["class_group_id"]))?.["name"]) || "Turma",
          subjectName:
            str(subjectById.get(str(classSubject?.["subject_id"]))?.["name"]) || "Disciplina",
          component: str(item?.["code"]),
          term: book ? Number(termById.get(str(book["term_id"]))?.["sequence"] ?? 0) || null : null,
          current: r["score"] == null ? null : Number(r["score"]),
          requested: Number(r["pending_score"]),
          reason: str(r["pending_reason"]),
          requestedBy:
            str(requesterByUser.get(str(r["pending_requested_by"]))?.["full_name"]) || "—",
          requestedAt: str(r["pending_requested_at"]),
          sheetStatus: sheet ? str(sheet["status"]) : null,
        };
      }),
    };
  });

const decideInput = z.object({
  gradeScoreId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export const decideGradeChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decideInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: score } = await db
      .from("grade_scores")
      .select(
        "id, grade_item_id, score, pending_score, pending_reason, pending_requested_by, pending_requested_at",
      )
      .eq("school_id", schoolId)
      .eq("id", data.gradeScoreId)
      .maybeSingle();
    if (!score || score.pending_score == null) throw new Error("Este pedido já foi decidido.");

    if (data.approve) {
      // Sem caderneta ou sem conseguir ler as pautas não se aprova: a nota
      // oficial nunca muda sem a certeza de que a pauta está reaberta.
      const { data: item } = await db
        .from("grade_items")
        .select("gradebook_id")
        .eq("id", score.grade_item_id)
        .maybeSingle();
      const { data: book } = item
        ? await db
            .from("gradebooks")
            .select("class_group_id, term_id")
            .eq("school_id", schoolId)
            .eq("id", item.gradebook_id)
            .maybeSingle()
        : { data: null };
      if (!book) throw new Error("Não foi possível localizar a caderneta desta nota.");
      const { data: sheets, error: sheetsError } = await db
        .from("grade_sheets")
        .select("kind, term_id, status")
        .eq("school_id", schoolId)
        .eq("class_group_id", book.class_group_id)
        .in("status", LOCKED_SHEET_STATUSES);
      if (sheetsError && !isMissing(sheetsError.message)) {
        throw publicDatabaseError(sheetsError, "Não foi possível confirmar o estado da pauta.");
      }
      const locked = (sheets ?? []).find(
        (s: Row) => str(s["kind"]) === "annual" || str(s["term_id"]) === str(book.term_id),
      );
      if (locked) {
        throw new Error(
          "A pauta deste período ainda está oficial. Reabra-a para rectificação (com motivo) e depois aprove o pedido.",
        );
      }
    }

    // Decisão atómica: só a primeira decisão fecha o pedido (o mesmo pedido,
    // com o mesmo valor e data); uma segunda aprovação em simultâneo não
    // duplica o histórico nem reaplica a nota.
    let decideQuery = db
      .from("grade_scores")
      .update({
        ...(data.approve ? { score: score.pending_score } : {}),
        pending_score: null,
        pending_reason: null,
        pending_requested_by: null,
        pending_requested_at: null,
        updated_by: context.userId,
      })
      .eq("school_id", schoolId)
      .eq("id", score.id)
      .eq("pending_score", score.pending_score);
    decideQuery =
      score.pending_requested_at == null
        ? decideQuery.is("pending_requested_at", null)
        : decideQuery.eq("pending_requested_at", score.pending_requested_at);
    const { data: decided, error } = await decideQuery.select("id");
    if (error) throw publicDatabaseError(error, "Não foi possível concluir a decisão.");
    if (!decided?.length) throw new Error("Este pedido já foi decidido.");

    const history = {
      school_id: schoolId,
      grade_score_id: score.id,
      previous_score: score.score,
      new_score: data.approve ? score.pending_score : score.score,
      reason: `${str(score.pending_reason)}${data.note ? ` · ${data.note}` : ""}`.slice(0, 1000),
      actor_user_id: score.pending_requested_by,
      approved_by: context.userId,
      kind: data.approve ? "request_approved" : "request_rejected",
    };
    const { error: historyError } = await db.from("grade_score_history").insert(history);
    if (historyError && !isMissing(historyError.message)) {
      // Sem histórico a alteração não fica: repor a nota e o pedido pendente.
      await db
        .from("grade_scores")
        .update({
          score: score.score,
          pending_score: score.pending_score,
          pending_reason: score.pending_reason,
          pending_requested_by: score.pending_requested_by,
          pending_requested_at: score.pending_requested_at,
        })
        .eq("school_id", schoolId)
        .eq("id", score.id);
      throw publicDatabaseError(historyError, "Não foi possível registar o histórico.");
    }

    if (score.pending_requested_by) {
      await insertInAppNotifications(db, schoolId, [
        {
          userId: str(score.pending_requested_by),
          eventType: data.approve
            ? "academic.grade_change.approved"
            : "academic.grade_change.rejected",
          title: data.approve ? "Alteração de nota aprovada" : "Alteração de nota recusada",
          body: data.approve
            ? `A nota passou de ${score.score ?? "—"} para ${score.pending_score}.${data.note ? ` ${data.note}` : ""} Recalcule e homologue de novo a pauta.`
            : `O pedido (${score.score ?? "—"} → ${score.pending_score}) foi recusado.${data.note ? ` Motivo: ${data.note}` : ""}`,
        },
      ]).catch(() => 0);
    }
    return { ok: true, historyRecorded: !historyError };
  });
