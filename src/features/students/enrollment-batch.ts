/**
 * Transferir e confirmar matrículas existentes em lote sem sobrepor alterações
 * concorrentes. Cada UPDATE aplica a versão observada (turma + estado).
 *
 * Não é uma transacção global: reportar êxitos e falhas por aluno. O gatilho
 * PostgreSQL continua a decidir a lotação no momento da escrita.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export type ExistingEnrollmentRow = {
  id: string;
  student_id: string;
  class_group_id: string | null;
  status: string;
};

export type BatchPlacementFailure = {
  studentId: string;
  message: string;
};

export type BatchPlacementResult = {
  placedIds: string[];
  failed: BatchPlacementFailure[];
};

export async function commitExistingEnrollmentPlacements(
  db: AdminDb,
  input: {
    schoolId: string;
    targetClassGroupId: string;
    userId: string;
    rows: readonly ExistingEnrollmentRow[];
  },
): Promise<BatchPlacementResult> {
  const placedIds: string[] = [];
  const failed: BatchPlacementFailure[] = [];

  for (const row of input.rows) {
    // Uma repetição da mesma matrícula activa é um no-op.
    if (row.class_group_id === input.targetClassGroupId && row.status === "active") {
      placedIds.push(row.student_id);
      continue;
    }

    let query = db
      .from("enrollments")
      .update({
        class_group_id: input.targetClassGroupId,
        status: "active",
        updated_by: input.userId,
      })
      .eq("school_id", input.schoolId)
      .eq("id", row.id)
      .eq("student_id", row.student_id)
      .eq("status", row.status);

    query =
      row.class_group_id == null
        ? query.is("class_group_id", null)
        : query.eq("class_group_id", row.class_group_id);

    const { data, error } = await query.select("id");
    if (error) {
      failed.push({
        studentId: row.student_id,
        message: publicDatabaseError(error, "Não foi possível actualizar a matrícula.").message,
      });
      continue;
    }
    if (!data?.length) {
      failed.push({
        studentId: row.student_id,
        message:
          "Esta matrícula foi alterada por outra sessão. Actualize a lista antes de tentar de novo.",
      });
      continue;
    }

    placedIds.push(row.student_id);
  }

  return { placedIds, failed };
}
