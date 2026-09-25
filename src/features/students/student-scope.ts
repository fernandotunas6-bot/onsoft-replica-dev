/**
 * Que alunos uma conta pode ver.
 *
 * As funções de alunos lêem com a chave de serviço, por isso a escola não
 * chega: um aluno ou encarregado é membro da escola, mas só pode ver o seu
 * cadastro (ou o dos educandos). O pessoal da escola vê todos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const STUDENT_STAFF_ROLES = ["Administrador", "Secretaria", "Tesouraria", "Professor"];

export type StudentScope =
  { all: true } | { all: false; studentIds: string[]; personIds: string[] };

type Linked = {
  person_id: string | null;
  student_id: string | null;
  linked_students: { student_id: string }[];
};

export function studentScopeFor(
  role: string,
  linked: Linked,
  childPersonIds: string[] = [],
): StudentScope {
  if (STUDENT_STAFF_ROLES.includes(role)) return { all: true };
  const own = role === "Aluno" && linked.student_id ? [linked.student_id] : [];
  const children = role === "Encarregado" ? linked.linked_students.map((s) => s.student_id) : [];
  const childPeople = role === "Encarregado" ? childPersonIds : [];
  return {
    all: false,
    studentIds: [...new Set([...own, ...children])],
    personIds: [...new Set([...(linked.person_id ? [linked.person_id] : []), ...childPeople])],
  };
}

export function canSeeStudent(scope: StudentScope, studentId: string): boolean {
  return scope.all || scope.studentIds.includes(studentId);
}

export function canSeePerson(scope: StudentScope, personId: string): boolean {
  return scope.all || scope.personIds.includes(personId);
}

export function assertCanSeeStudent(scope: StudentScope, studentId: string): void {
  if (!canSeeStudent(scope, studentId)) throw new Error("Aluno não encontrado");
}

/** Pessoal da escola não precisa de consulta; os outros resolvem as ligações. */
export async function loadStudentScope(
  db: SupabaseClient,
  membership: { schoolId: string; appRole: string },
  userId: string,
): Promise<StudentScope> {
  if (STUDENT_STAFF_ROLES.includes(membership.appRole)) return { all: true };
  const { resolveUserLinkedEntities } = await import("@/features/auth/server");
  const linked = await resolveUserLinkedEntities(db as never, membership.schoolId, userId);
  const childIds = linked.linked_students.map((s) => s.student_id);
  let childPersonIds: string[] = [];
  if (membership.appRole === "Encarregado" && childIds.length) {
    const { data } = await db
      .from("students")
      .select("person_id")
      .eq("school_id", membership.schoolId)
      .in("id", childIds);
    childPersonIds = (data ?? []).map((row: { person_id: string }) => row.person_id);
  }
  return studentScopeFor(membership.appRole, linked, childPersonIds);
}
