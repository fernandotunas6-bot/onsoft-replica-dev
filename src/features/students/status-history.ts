import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** Regista transição de estado; ignora só se a tabela ainda não existir no SGA. */
export async function recordStudentStatusHistory(
  db: AdminDb,
  input: {
    schoolId: string;
    studentId: string;
    previousStatus: string | null;
    newStatus: string;
    reason?: string | null;
    changedBy: string;
  },
) {
  const { error } = await db.from("student_status_history").insert({
    school_id: input.schoolId,
    student_id: input.studentId,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    reason: input.reason || null,
    changed_by: input.changedBy,
  });
  if (!error) return;
  if (/student_status_history|42P01|schema cache|does not exist/i.test(error.message)) {
    return;
  }
  throw publicDatabaseError(error, "Não foi possível registar o histórico de estado.");
}

/** O mesmo registo para vários alunos, numa só escrita (acções em lote). */
export async function recordStudentStatusHistoryBatch(
  db: AdminDb,
  input: {
    schoolId: string;
    changes: Array<{ studentId: string; previousStatus: string | null }>;
    newStatus: string;
    reason?: string | null;
    changedBy: string;
  },
) {
  if (input.changes.length === 0) return;
  const { error } = await db.from("student_status_history").insert(
    input.changes.map((change) => ({
      school_id: input.schoolId,
      student_id: change.studentId,
      previous_status: change.previousStatus,
      new_status: input.newStatus,
      reason: input.reason || null,
      changed_by: input.changedBy,
    })),
  );
  if (!error) return;
  if (/student_status_history|42P01|schema cache|does not exist/i.test(error.message)) {
    return;
  }
  throw publicDatabaseError(error, "Não foi possível registar o histórico de estado.");
}
