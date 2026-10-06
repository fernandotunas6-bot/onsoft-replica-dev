/**
 * Estado do aluno e matrícula corrente andam juntos (auditoria 13, A4).
 *
 * Antes, marcar um aluno como transferido, concluído ou inactivo deixava a
 * matrícula do ano `active`: continuava a ocupar lugar na turma, a aparecer nas
 * pautas e nas listas de chamada. E anular a matrícula deixava o aluno `active`
 * sem turma nenhuma. Regra decidida pelo dono:
 *
 *   transferido → matrícula `transferred`
 *   concluído   → matrícula `completed`
 *   inactivo / cancelado → matrícula `cancelled`
 *   suspenso, bloqueado, candidato, activo → a matrícula fica como está
 *
 * e anular a última matrícula corrente deixa o aluno `inactive`.
 *
 * `ended_on` fica vazio, como em `cancelEnrollment`: a base aceita-o num estado
 * final e evita a regra `ended_on >= enrolled_on` numa matrícula com data futura.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export const CURRENT_ENROLLMENT_STATUSES = ["pending", "active"] as const;

type ClosedEnrollmentStatus = "transferred" | "completed" | "cancelled";

/** Estado em que a matrícula corrente fica quando o aluno passa a `studentStatus`. */
export function enrollmentStatusForStudentStatus(
  studentStatus: string,
): ClosedEnrollmentStatus | null {
  switch (studentStatus) {
    case "transferred":
      return "transferred";
    case "graduated":
      return "completed";
    case "inactive":
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}

const DEFAULT_END_REASON: Record<ClosedEnrollmentStatus, string> = {
  transferred: "Aluno transferido",
  completed: "Aluno concluiu",
  cancelled: "Aluno inactivo",
};

/** `end_reason` aceita 3 a 300 caracteres. */
export function enrollmentEndReason(
  status: ClosedEnrollmentStatus,
  reason: string | null | undefined,
): string {
  const text = reason?.trim() ?? "";
  return text.length >= 3 ? text.slice(0, 300) : DEFAULT_END_REASON[status];
}

/**
 * Fecha as matrículas correntes dos alunos que mudaram para um estado final.
 * Devolve quantas fechou.
 */
export async function closeCurrentEnrollmentsForStatus(
  db: AdminDb,
  input: {
    schoolId: string;
    studentIds: string[];
    studentStatus: string;
    reason?: string | null;
    userId: string;
  },
): Promise<number> {
  const target = enrollmentStatusForStudentStatus(input.studentStatus);
  if (!target || input.studentIds.length === 0) return 0;
  const { data, error } = await db
    .from("enrollments")
    .update({
      status: target,
      end_reason: enrollmentEndReason(target, input.reason),
      updated_by: input.userId,
    })
    .eq("school_id", input.schoolId)
    .in("student_id", input.studentIds)
    .in("status", [...CURRENT_ENROLLMENT_STATUSES])
    .select("id");
  if (error) {
    throw publicDatabaseError(
      error,
      "O estado do aluno mudou, mas a matrícula corrente não foi fechada.",
    );
  }
  return (data ?? []).length;
}

/** O aluno ainda tem alguma matrícula corrente (em qualquer ano)? */
export async function hasCurrentEnrollment(
  db: AdminDb,
  schoolId: string,
  studentId: string,
): Promise<boolean> {
  const { count, error } = await db
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .in("status", [...CURRENT_ENROLLMENT_STATUSES]);
  if (error) throw publicDatabaseError(error, "Não foi possível verificar as matrículas do aluno.");
  return (count ?? 0) > 0;
}
