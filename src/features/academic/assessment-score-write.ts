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
import { recordAuditBatch } from "@/features/audit/record-audit";
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
  const pedagogy = pedagogySettingsSchema.safeParse(data?.value ?? {}).data;
  if (pedagogy?.closedTerms.includes(term as 1 | 2 | 3)) {
    throw new Error(
      `O ${term}º trimestre está fechado. O director pode reabrir a pauta em Configurações → Pedagógico.`,
    );
  }
}

export type AssessmentScoreRow = { enrollmentId: string; score: number | null };

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
  if (maxScore != null && input.rows.some((row) => row.score != null && row.score > maxScore)) {
    throw new Error(`Esta avaliação vale ${maxScore} valores: nenhuma nota pode passar disso.`);
  }
  await assertTermOpen(db, input.schoolId, Number(item.term));
  // Pauta homologada/publicada: as notas das avaliações também ficam fechadas
  // (a alteração passa a pedido), como as de MAC/NPP/NPT.
  await assertAssessmentTermNotLocked(
    db,
    input.schoolId,
    String(item.class_group_id),
    Number(item.term),
  );

  // 1 SELECT para todos os alunos do lote + 1 INSERT em lote (novos) + updates em
  // paralelo — substitui o anterior select+insert/update sequencial por aluno, que
  // tornava lançar notas de uma turma inteira em dezenas de idas e vindas à base.
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
    .select("id, score, enrollment_id")
    .eq("item_id", input.itemId)
    .in("enrollment_id", enrollmentIds);
  if (existingError) {
    throw publicDatabaseError(existingError, "Não foi possível verificar as notas existentes.");
  }
  const existingByEnrollment = new Map(
    (existingRows ?? []).map((row) => [row.enrollment_id, row] as const),
  );
  const toInsert = input.rows.filter((row) => !existingByEnrollment.has(row.enrollmentId));
  const toUpdate = input.rows.filter((row) => existingByEnrollment.has(row.enrollmentId));

  const [insertResult, ...updateResults] = await Promise.all([
    toInsert.length
      ? db.from("siga_assessment_scores").insert(
          toInsert.map((row) => ({
            school_id: input.schoolId,
            item_id: input.itemId,
            enrollment_id: row.enrollmentId,
            score: row.score,
            recorded_by: input.userId,
          })),
        )
      : Promise.resolve({ error: null }),
    ...toUpdate.map((row) => {
      const existing = existingByEnrollment.get(row.enrollmentId)!;
      return db
        .from("siga_assessment_scores")
        .update({
          previous_score: existing.score,
          score: row.score,
          recorded_by: input.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("school_id", input.schoolId);
    }),
  ]);
  // Lançar notas é a escrita de maior consequência do sistema. Sem registo,
  // um lote que falha a meio — uns alunos gravados, outros não — chega ao
  // professor como uma mensagem genérica e não deixa rasto nenhum.
  const failure = insertResult.error ?? updateResults.find((result) => result.error)?.error;
  if (failure) {
    reportSigaError("assessment.score.write_failed", failure, {
      module: "academic",
      action: "score.upsert",
      school_id: input.schoolId,
      assessment_item_id: input.itemId,
      user_id: input.userId,
      count: input.rows.length,
    });
  }
  if (insertResult.error)
    throw publicDatabaseError(insertResult.error, "Não foi possível lançar as notas.");
  for (const result of updateResults) {
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível actualizar as notas.");
  }
  // A tabela só guarda a nota anterior: uma nota mudada duas vezes perdia a
  // original. Cada alteração de uma nota já lançada fica em audit_logs.
  await recordAuditBatch(
    toUpdate
      .map((row) => ({ row, existing: existingByEnrollment.get(row.enrollmentId)! }))
      .filter(({ row, existing }) => Number(existing.score) !== Number(row.score))
      .map(({ row, existing }) => ({
        schoolId: input.schoolId,
        actorUserId: input.userId,
        action: "grades.assessment_score_changed",
        entityType: "siga_assessment_scores",
        entityId: existing.id,
        metadata: {
          item_id: input.itemId,
          enrollment_id: row.enrollmentId,
          from: existing.score,
          to: row.score,
        },
      })),
  );
  return { saved: input.rows.length };
}
