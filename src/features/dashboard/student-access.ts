/**
 * Que aluno esta conta pode ver no portal: o Aluno a si próprio, o
 * Encarregado um educando ligado. Pessoal da escola e outros papéis: null.
 *
 * Usa a chave de serviço porque o RLS não deixa o aluno ler matrículas,
 * turmas, disciplinas nem notas; a restrição é esta verificação.
 */
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { canSeeStudent, loadStudentScope } from "@/features/students/student-scope";

export type VisibleStudent = {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  studentId: string;
};

export async function resolveVisibleStudent(
  userId: string,
  requestedStudentId?: string,
): Promise<VisibleStudent | null> {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership || !["Aluno", "Encarregado"].includes(membership.appRole)) return null;
  const db = await loadSgaAdminClient();
  const scope = await loadStudentScope(db, membership, userId);
  if (scope.all) return null;
  const studentId = requestedStudentId ?? scope.studentIds[0];
  if (!studentId || !canSeeStudent(scope, studentId)) return null;
  return { db, schoolId: membership.schoolId, studentId };
}
