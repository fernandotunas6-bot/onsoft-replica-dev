/**
 * Gravar notas de uma avaliação (siga_assessment_scores), com as regras da pauta:
 * cotação máxima, período aberto, pauta não homologada, alunos da turma, histórico
 * em audit_logs. Partilhado pelo lançamento na pauta e pela devolução de trabalhos,
 * para que nenhum caminho grave uma nota fora destas regras.
 *
 * Quem chama já validou o papel e a escola (requireSgaWriterForWrite).
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { academicWriteRpcClient } from "@/integrations/supabase/academic-write-rpcs";
import { pedagogySettingsSchema } from "@/features/school/schemas";
import { reportSigaError } from "@/lib/ops-report";
import { assertAssessmentTermNotLocked } from "./sga-grades";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

function isMissingRelation(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(error.message ?? "")
  );
}

export async function assertTermOpen(db: Db, schoolId: string, term: number) {
  const { data, error } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", "pedagogy")
    .maybeSingle();
  // Sem conseguir ler os períodos fechados, não se grava (antes contava como aberto).
  if (error)
    throw publicDatabaseError(error, "Não foi possível confirmar se o período está aberto.");
  const parsed = pedagogySettingsSchema.safeParse(data?.value ?? {});
  if (!parsed.success)
    throw new Error("A configuração pedagógica é inválida. Reveja-a antes de lançar notas.");
  const pedagogy = parsed.data;
  if (pedagogy?.closedTerms.includes(term as 1 | 2 | 3)) {
    throw new Error(
      `O ${term}º trimestre está fechado. O director pode reabrir a pauta em Configurações → Pedagógico.`,
    );
  }
}

export type AssessmentScoreRow = { enrollmentId: string; score: number | null };

/**
 * A nota mudou? Ausente é ausente, não zero: `Number(null)` dá 0, e uma nota
 * apagada (ou lançada como 0 onde não havia nada) saía da auditoria.
 */
export function sameScore(before: unknown, after: unknown): boolean {
  const value = (score: unknown) => (score == null || score === "" ? null : Number(score));
  return value(before) === value(after);
}

/**
 * Recusa um lote ambíguo antes da primeira gravação. A UI valida a escala,
 * mas os outros consumidores do núcleo também passam por esta protecção.
 */
export function validateAssessmentScoreBatch(
  rows: readonly AssessmentScoreRow[],
  maxScore: number | null,
) {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.enrollmentId.trim()) throw new Error("Identifique o aluno antes de lançar notas.");
    if (seen.has(row.enrollmentId)) {
      throw new Error("O mesmo aluno foi incluído duas vezes no lote de notas.");
    }
    seen.add(row.enrollmentId);
    if (row.score === null) continue;
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > 20) {
      throw new Error("As notas devem ser valores finitos entre 0 e 20.");
    }
    if (maxScore != null && row.score > maxScore) {
      throw new Error(`Esta avaliação vale ${maxScore} valores: nenhuma nota pode passar disso.`);
    }
  }
}

export async function writeAssessmentScores(
  db: Db,
  input: { schoolId: string; userId: string; itemId: string; rows: AssessmentScoreRow[] },
): Promise<{ saved: number }> {
  const { data: item, error: itemError } = await db
    .from("siga_assessment_items")
    .select("id, term, class_group_id, max_score")
    .eq("id", input.itemId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (itemError) {
    if (isMissingRelation(itemError)) {
      throw new Error(
        "Tabelas de avaliações em falta. Corra supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql.",
      );
    }
    throw publicDatabaseError(itemError, "Não foi possível validar a avaliação.");
  }
  if (!item?.id) throw new Error("Avaliação não encontrada.");
  // O esquema aceita até 20 para qualquer avaliação; uma prova cotada para 10
  // aceitava 18, e o domínio por competência passava dos 100%.
  const maxScore = item.max_score == null ? null : Number(item.max_score);
  validateAssessmentScoreBatch(input.rows, maxScore);
  await assertTermOpen(db, input.schoolId, Number(item.term));
  // Pauta homologada/publicada: as notas das avaliações também ficam fechadas
  // (a alteração passa a pedido), como as de MAC/NPP/NPT.
  await assertAssessmentTermNotLocked(
    db,
    input.schoolId,
    String(item.class_group_id),
    Number(item.term),
  );

  // Validar turma e versão observada; a RPC repete as verificações sob locks.
  const enrollmentIds = input.rows.map((row) => row.enrollmentId);
  // Só alunos da turma da avaliação. Para o professor a base já o exige (gatilho
  // `enforce_teacher_assessment_score_scope`); para a Administração e a
  // Secretaria não, e uma nota podia ficar num aluno de outra turma.
  const { data: classEnrollments, error: classError } = await db
    .from("enrollments")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("class_group_id", String(item.class_group_id))
    .in("id", enrollmentIds);
  if (classError) {
    throw publicDatabaseError(classError, "Não foi possível confirmar os alunos da turma.");
  }
  if ((classEnrollments ?? []).length !== new Set(enrollmentIds).size) {
    throw new Error("Há alunos que não são da turma desta avaliação.");
  }
  const { data: existingRows, error: existingError } = await db
    .from("siga_assessment_scores")
    .select("enrollment_id, score")
    .eq("school_id", input.schoolId)
    .eq("item_id", input.itemId)
    .in("enrollment_id", enrollmentIds);
  if (existingError)
    throw publicDatabaseError(existingError, "Não foi possível verificar as notas existentes.");
  const existing = new Map((existingRows ?? []).map((row) => [row.enrollment_id, row.score]));
  const rows = input.rows.map((row) => ({
    ...row,
    expectedExists: existing.has(row.enrollmentId),
    expectedScore: existing.get(row.enrollmentId) ?? null,
  }));
  // A RPC volta a validar e grava o lote e a auditoria numa só transacção.
  // Não usar fallback por passos se a migração ainda não estiver instalada.
  const { data: saved, error } = await academicWriteRpcClient(db).rpc(
    "siga_write_assessment_scores_atomic",
    {
      p_school_id: input.schoolId,
      p_actor_user_id: input.userId,
      p_item_id: input.itemId,
      p_rows: rows,
    },
  );
  if (error) {
    reportSigaError("assessment.score.write_failed", error, {
      module: "academic",
      action: "score.upsert",
      school_id: input.schoolId,
      assessment_item_id: input.itemId,
      user_id: input.userId,
      count: input.rows.length,
    });
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error(
        "A gravação segura das notas requer a actualização académica da base de dados.",
      );
    }
    throw publicDatabaseError(
      error,
      "Não foi possível confirmar o lote de notas. Actualize a pauta antes de repetir.",
    );
  }
  if (typeof saved !== "number" || saved !== input.rows.length) {
    throw new Error(
      "Não foi possível confirmar o lote de notas. Actualize a pauta antes de repetir.",
    );
  }
  return { saved };
}
