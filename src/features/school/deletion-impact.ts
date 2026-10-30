/**
 * Impacto real de uma eliminação/desactivação, contado no servidor antes de a
 * pessoa confirmar (`DeleteConfirmModal`). As regras de bloqueio são as mesmas
 * que a operação aplica ao gravar: o aviso nunca promete o que a base recusa.
 *
 * Todas as contagens filtram a escola da sessão; nenhum ID do browser escolhe
 * a escola.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export type DeletionImpact = {
  impacts: Array<{ label: string; count: number }>;
  /** Quando há, a operação será recusada: o diálogo não deixa confirmar. */
  blocker: string | null;
  warning: string | null;
};

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  fallback: string,
) {
  const { count, error } = await query;
  if (error) throw publicDatabaseError(error as never, fallback);
  return count ?? 0;
}

/** Turma: arquivar recusa-se com matrículas activas ou pendentes (deleteClassGroup). */
export async function classGroupDeletionImpact(
  db: AdminDb,
  schoolId: string,
  classGroupId: string,
): Promise<DeletionImpact> {
  const fallback = "Não foi possível calcular o impacto na turma.";
  const [enrollments, subjects, assessments] = await Promise.all([
    countRows(
      db
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("class_group_id", classGroupId)
        .eq("school_id", schoolId)
        .in("status", ["active", "pending"]),
      fallback,
    ),
    countRows(
      db
        .from("class_subjects")
        .select("id", { count: "exact", head: true })
        .eq("class_group_id", classGroupId)
        .eq("school_id", schoolId)
        .eq("status", "active"),
      fallback,
    ),
    countRows(
      db
        .from("siga_assessment_items")
        .select("id", { count: "exact", head: true })
        .eq("class_group_id", classGroupId)
        .eq("school_id", schoolId),
      fallback,
    ),
  ]);
  return {
    impacts: [
      { label: "matrícula(s) activa(s) ou pendente(s)", count: enrollments },
      { label: "disciplina(s) com professor atribuído", count: subjects },
      { label: "avaliação(ões) — ficam no histórico", count: assessments },
    ].filter((item) => item.count > 0),
    blocker:
      enrollments > 0
        ? "A turma ainda tem matrículas activas ou pendentes. Transfira ou anule as matrículas antes de a desactivar."
        : null,
    warning: "A turma fica arquivada: notas, presenças e histórico mantêm-se.",
  };
}

/** Professor: desligar recusa-se com disciplinas activas atribuídas (deleteTeacher). */
export async function teacherDeletionImpact(
  db: AdminDb,
  schoolId: string,
  teacherId: string,
): Promise<DeletionImpact> {
  const subjects = await countRows(
    db
      .from("class_subjects")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("teacher_id", teacherId)
      .eq("status", "active"),
    "Não foi possível calcular o impacto no professor.",
  );
  return {
    impacts:
      subjects > 0 ? [{ label: "disciplina(s) activa(s) atribuída(s)", count: subjects }] : [],
    blocker:
      subjects > 0
        ? "Este professor ainda está ligado a disciplinas activas. Reatribua as turmas antes de o desligar."
        : null,
    warning:
      "O professor fica inactivo e perde o acesso ao painel; a ficha e o histórico mantêm-se.",
  };
}

/** Avaliação: eliminar apaga as notas lançadas nela (delete_sga_assessment_item). */
export async function assessmentItemDeletionImpact(
  db: AdminDb,
  schoolId: string,
  itemId: string,
): Promise<DeletionImpact> {
  const scores = await countRows(
    db
      .from("siga_assessment_scores")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("item_id", itemId)
      .not("score", "is", null),
    "Não foi possível calcular o impacto na avaliação.",
  );
  return {
    impacts: scores > 0 ? [{ label: "nota(s) lançada(s) serão eliminadas", count: scores }] : [],
    blocker: null,
    warning: scores > 0 ? "As notas desta avaliação deixam de contar na pauta." : null,
  };
}
