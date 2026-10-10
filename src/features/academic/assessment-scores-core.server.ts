import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { recordAuditBatch } from "@/features/audit/record-audit";
import { reportSigaError } from "@/lib/ops-report";
import { pedagogySettingsSchema } from "@/features/school/schemas";
import { assertAssessmentTermNotLocked } from "./sga-grades";
import type { UpsertAssessmentScoresInput } from "./schemas";

/**
 * Lançamento de notas de uma avaliação (teste, trabalho), partilhado pelo portal
 * (`upsertAssessmentScores`) e pela app móvel. Sem server functions: quem chama
 * já autenticou e verificou o papel.
 */

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    /schema cache|does not exist|relation .* does not exist/i.test(String(error?.message ?? ""))
  );
}

export class AssessmentScoresError extends Error {
  constructor(
    public readonly code: "ITEM_NOT_FOUND" | "ABOVE_MAX" | "NOT_IN_CLASS" | "STALE",
    message: string,
  ) {
    super(message);
    this.name = "AssessmentScoresError";
  }
}

export async function assertTermOpen(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  term: number,
) {
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

export async function recordAssessmentScores(
  db: AdminDb,
  actor: { schoolId: string; userId: string },
  data: UpsertAssessmentScoresInput,
  options: { expectedUpdatedAt?: Map<string, string | null> } = {},
) {
  const { data: item, error: itemError } = await db
    .from("siga_assessment_items")
    .select("id, term, class_group_id, max_score")
    .eq("id", data.itemId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (itemError) {
    if (isMissingRelation(itemError)) {
      throw new Error(
        "Tabelas de avaliações em falta. Corra supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql.",
      );
    }
    throw publicDatabaseError(itemError, "Não foi possível validar a avaliação.");
  }
  if (!item?.id) throw new AssessmentScoresError("ITEM_NOT_FOUND", "Avaliação não encontrada.");
  // O esquema aceita até 20 para qualquer avaliação; uma prova cotada para 10
  // aceitava 18, e o domínio por competência passava dos 100%.
  const maxScore = item.max_score == null ? null : Number(item.max_score);
  if (maxScore != null && data.rows.some((row) => row.score != null && row.score > maxScore)) {
    throw new AssessmentScoresError(
      "ABOVE_MAX",
      `Esta avaliação vale ${maxScore} valores: nenhuma nota pode passar disso.`,
    );
  }
  await assertTermOpen(db, actor.schoolId, Number(item.term));
  // Pauta homologada/publicada: as notas das avaliações também ficam fechadas
  // (a alteração passa a pedido), como as de MAC/NPP/NPT.
  await assertAssessmentTermNotLocked(
    db,
    actor.schoolId,
    String(item.class_group_id),
    Number(item.term),
  );

  // 1 SELECT para todos os alunos do lote + 1 INSERT em lote (novos) + updates em
  // paralelo — substitui o anterior select+insert/update sequencial por aluno, que
  // tornava lançar notas de uma turma inteira em dezenas de idas e vindas à base.
  const enrollmentIds = data.rows.map((row) => row.enrollmentId);
  // Só alunos da turma da avaliação. Para o professor a base já o exige (gatilho
  // `enforce_teacher_assessment_score_scope`); para a Administração e a
  // Secretaria não, e uma nota podia ficar num aluno de outra turma.
  const { data: classEnrollments, error: classError } = await db
    .from("enrollments")
    .select("id")
    .eq("school_id", actor.schoolId)
    .eq("class_group_id", String(item.class_group_id))
    .in("id", enrollmentIds);
  if (classError) {
    throw publicDatabaseError(classError, "Não foi possível confirmar os alunos da turma.");
  }
  if ((classEnrollments ?? []).length !== new Set(enrollmentIds).size) {
    throw new AssessmentScoresError(
      "NOT_IN_CLASS",
      "Há alunos que não são da turma desta avaliação.",
    );
  }
  const { data: existingRows, error: existingError } = await db
    .from("siga_assessment_scores")
    .select("id, score, enrollment_id, updated_at")
    .eq("item_id", data.itemId)
    .in("enrollment_id", enrollmentIds);
  if (existingError) {
    throw publicDatabaseError(existingError, "Não foi possível verificar as notas existentes.");
  }
  const existingByEnrollment = new Map(
    (existingRows ?? []).map((row) => [row.enrollment_id, row] as const),
  );
  // Quem lança sem ver a nota de outra pessoa (app móvel) envia a data da versão
  // que viu; uma nota mudada entretanto não é sobrescrita.
  if (options.expectedUpdatedAt) {
    const changed = data.rows.some((row) => {
      const seen = options.expectedUpdatedAt!.get(row.enrollmentId) ?? null;
      const current = existingByEnrollment.get(row.enrollmentId)?.updated_at ?? null;
      return (seen ? Date.parse(seen) : null) !== (current ? Date.parse(String(current)) : null);
    });
    if (changed) {
      throw new AssessmentScoresError(
        "STALE",
        "Outra pessoa alterou notas desta avaliação. Actualize antes de voltar a gravar.",
      );
    }
  }
  const toInsert = data.rows.filter((row) => !existingByEnrollment.has(row.enrollmentId));
  const toUpdate = data.rows.filter((row) => existingByEnrollment.has(row.enrollmentId));

  const [insertResult, ...updateResults] = await Promise.all([
    toInsert.length
      ? db.from("siga_assessment_scores").insert(
          toInsert.map((row) => ({
            school_id: actor.schoolId,
            item_id: data.itemId,
            enrollment_id: row.enrollmentId,
            score: row.score,
            recorded_by: actor.userId,
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
          recorded_by: actor.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("school_id", actor.schoolId);
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
      school_id: actor.schoolId,
      assessment_item_id: data.itemId,
      user_id: actor.userId,
      count: data.rows.length,
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
        schoolId: actor.schoolId,
        actorUserId: actor.userId,
        action: "grades.assessment_score_changed",
        entityType: "siga_assessment_scores",
        entityId: existing.id,
        metadata: {
          item_id: data.itemId,
          enrollment_id: row.enrollmentId,
          from: existing.score,
          to: row.score,
        },
      })),
  );
  return { saved: data.rows.length };
}
