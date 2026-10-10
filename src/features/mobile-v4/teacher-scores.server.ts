import { requireMobileAcademicAccess } from "./authorization";
import { resolveMobileAcademicScope } from "./academic-scope.server";
import { readMobileAcademicCatalog } from "./academic-catalog.server";
import { MobileApiError } from "./errors";
import { mobileScopeSchema, type MobileCommandRequest } from "./schemas";

/**
 * Notas das avaliações (testes, trabalhos) lançadas pelo professor na app móvel.
 * A escrita é a do portal (`recordAssessmentScores` em
 * `features/academic/assessment-scores-core.server.ts`): cotação, período fechado,
 * pauta oficial, só alunos da turma e auditoria das alterações. Aqui acrescenta-se
 * o professor da disciplina e a detecção de notas mudadas entretanto.
 */

const MAX_ROWS = 1000;
type ScoresCommand = Extract<MobileCommandRequest["command"], { type: "scores" }>;

/** Avaliações das disciplinas do professor, com as notas e a versão de cada uma. */
export async function loadMobileV4Assessments(userId: string, input: unknown) {
  const requested = mobileScopeSchema.parse(input);
  if (requested.role !== "professor") throw new MobileApiError(403, "TEACHER_ONLY");
  const { db } = await requireMobileAcademicAccess(userId, requested.schoolId, "professor", "read");
  const scope = await resolveMobileAcademicScope(db, userId, requested.schoolId, "professor");
  const catalog = await readMobileAcademicCatalog(db, scope, userId);
  const response = { schoolId: requested.schoolId, items: [] as unknown[] };
  if (!catalog.classes.length) return response;
  const byPair = new Map(
    catalog.classes.map((c) => [`${c.classGroupId}:${c.subjectId}`, c.classSubjectId]),
  );
  const { data: items, error } = await db
    .from("siga_assessment_items")
    .select("id, class_group_id, subject_id, term, name, kind, assessed_on, max_score, updated_at")
    .eq("school_id", requested.schoolId)
    .in("class_group_id", [...new Set(catalog.classes.map((c) => c.classGroupId))])
    .in("subject_id", [...new Set(catalog.classes.map((c) => c.subjectId))])
    .order("assessed_on", { ascending: true })
    .limit(MAX_ROWS + 1);
  if (error) throw new MobileApiError(503, "ASSESSMENTS_UNAVAILABLE");
  if ((items ?? []).length > MAX_ROWS) throw new MobileApiError(503, "ASSESSMENTS_TOO_LARGE");
  // A consulta por turma × disciplina cruza pares; fica só o par atribuído ao professor.
  const own = (items ?? []).filter((item) =>
    byPair.has(`${item.class_group_id}:${item.subject_id}`),
  );
  if (!own.length) return response;
  const { data: scores, error: scoresError } = await db
    .from("siga_assessment_scores")
    .select("item_id, enrollment_id, score, updated_at")
    .eq("school_id", requested.schoolId)
    .in(
      "item_id",
      own.map((item) => item.id),
    )
    .limit(MAX_ROWS * 10 + 1);
  if (scoresError) throw new MobileApiError(503, "ASSESSMENTS_UNAVAILABLE");
  if ((scores ?? []).length > MAX_ROWS * 10) throw new MobileApiError(503, "ASSESSMENTS_TOO_LARGE");
  response.items = own.map((item) => ({
    id: String(item.id),
    classSubjectId: byPair.get(`${item.class_group_id}:${item.subject_id}`)!,
    term: Number(item.term),
    name: String(item.name),
    kind: String(item.kind),
    assessedOn: item.assessed_on ? String(item.assessed_on) : null,
    maxScore: item.max_score == null ? null : Number(item.max_score),
    scores: (scores ?? [])
      .filter((row) => String(row.item_id) === String(item.id))
      .map((row) => ({
        enrollmentId: String(row.enrollment_id),
        score: row.score == null ? null : Number(row.score),
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      })),
  }));
  return response;
}

export async function recordMobileV4Scores(
  userId: string,
  request: MobileCommandRequest & { command: ScoresCommand },
) {
  const { db } = await requireMobileAcademicAccess(userId, request.schoolId, "professor", "write");
  const scope = await resolveMobileAcademicScope(db, userId, request.schoolId, "professor");
  const { itemId, entries } = request.command;
  const { data: item, error } = await db
    .from("siga_assessment_items")
    .select("id, class_group_id, subject_id")
    .eq("school_id", request.schoolId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new MobileApiError(503, "ASSESSMENTS_UNAVAILABLE");
  if (!item) throw new MobileApiError(404, "ITEM_NOT_FOUND");
  // Só o professor atribuído a esta turma e disciplina (o portal deixa-o à base).
  const { data: assigned, error: assignedError } = await db
    .from("class_subjects")
    .select("id")
    .eq("school_id", request.schoolId)
    .eq("class_group_id", String(item.class_group_id))
    .eq("subject_id", String(item.subject_id))
    .eq("teacher_id", scope.teacherId!)
    .eq("status", "active")
    .limit(1);
  if (assignedError) throw new MobileApiError(503, "ASSESSMENTS_UNAVAILABLE");
  if (!assigned?.length) throw new MobileApiError(403, "NOT_SUBJECT_TEACHER");
  const { recordAssessmentScores, AssessmentScoresError } =
    await import("@/features/academic/assessment-scores-core.server");
  try {
    const result = await recordAssessmentScores(
      db,
      { schoolId: request.schoolId, userId },
      {
        itemId,
        rows: entries.map((entry) => ({ enrollmentId: entry.enrollmentId, score: entry.score })),
      },
      {
        expectedUpdatedAt: new Map(
          entries.map((entry) => [entry.enrollmentId, entry.expectedUpdatedAt]),
        ),
      },
    );
    return { ok: true, saved: result.saved };
  } catch (failure) {
    if (failure instanceof AssessmentScoresError) {
      const status = {
        ITEM_NOT_FOUND: 404,
        ABOVE_MAX: 422,
        NOT_IN_CLASS: 422,
        STALE: 409,
      } as const;
      throw new MobileApiError(status[failure.code], failure.code);
    }
    // Período fechado ou pauta oficial (mensagens do portal): conflito, sem detalhes.
    if (failure instanceof Error && /fechad|oficial|homologad|publicad/i.test(failure.message)) {
      throw new MobileApiError(409, "PERIOD_LOCKED");
    }
    throw failure;
  }
}
