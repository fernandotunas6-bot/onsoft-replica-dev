/**
 * Que alunos uma conta pode ver.
 *
 * As funções de alunos lêem com a chave de serviço, por isso a escola não
 * chega: um aluno ou encarregado é membro da escola, mas só pode ver o seu
 * cadastro (ou o dos educandos). O pessoal da escola vê todos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const STUDENT_STAFF_ROLES = ["Administrador", "Secretaria", "Tesouraria", "Professor"];
/** Vêem todos os alunos da escola. O professor vê só os das suas turmas. */
export const STUDENT_OFFICE_ROLES = ["Administrador", "Secretaria", "Tesouraria"];

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

/**
 * E-mail da conta, só se confirmado. A ligação conta→ficha usa-o como o
 * perfil (auth/server.ts); um e-mail por confirmar nunca liga a uma ficha.
 */
export async function resolveVerifiedAccountEmail(
  db: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return data.user?.email_confirmed_at ? (data.user.email ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Turmas do professor: as das disciplinas que lecciona (as mesmas que a árvore
 * da barra lateral mostra) e aquelas de que é director de turma.
 */
export async function teacherClassGroupIds(
  db: SupabaseClient,
  schoolId: string,
  teacherId: string,
): Promise<string[]> {
  const [{ data: subjects, error: subjectsError }, { data: homerooms, error: homeroomError }] =
    await Promise.all([
      db
        .from("class_subjects")
        .select("class_group_id")
        .eq("school_id", schoolId)
        .eq("teacher_id", teacherId)
        .eq("status", "active"),
      db
        .from("class_groups")
        .select("id")
        .eq("school_id", schoolId)
        .eq("homeroom_teacher_id", teacherId),
    ]);
  // Falha fechada: sem saber as turmas, o professor não vê alunos.
  if (subjectsError || homeroomError) return [];
  return [
    ...new Set([
      ...(subjects ?? []).map((row: { class_group_id: string }) => String(row.class_group_id)),
      ...(homerooms ?? []).map((row: { id: string }) => String(row.id)),
    ]),
  ];
}

/** Alunos (e as fichas deles e dos encarregados) das turmas do professor. */
async function teacherStudentScope(
  db: SupabaseClient,
  schoolId: string,
  teacherId: string | null,
  ownPersonId: string | null,
): Promise<{ studentIds: string[]; personIds: string[] }> {
  const own = ownPersonId ? [ownPersonId] : [];
  if (!teacherId) return { studentIds: [], personIds: own };
  const classGroupIds = await teacherClassGroupIds(db, schoolId, teacherId);
  if (!classGroupIds.length) return { studentIds: [], personIds: own };
  const { data: enrollments, error } = await db
    .from("enrollments")
    .select("student_id")
    .eq("school_id", schoolId)
    .in("class_group_id", classGroupIds)
    .in("status", ["active", "pending"]);
  if (error) return { studentIds: [], personIds: own };
  const studentIds = [
    ...new Set((enrollments ?? []).map((row: { student_id: string }) => String(row.student_id))),
  ];
  if (!studentIds.length) return { studentIds, personIds: own };
  const [{ data: students }, { data: guardians }] = await Promise.all([
    db.from("students").select("person_id").eq("school_id", schoolId).in("id", studentIds),
    db
      .from("student_guardians")
      .select("guardian_person_id")
      .eq("school_id", schoolId)
      .in("student_id", studentIds),
  ]);
  return {
    studentIds,
    personIds: [
      ...new Set([
        ...own,
        ...(students ?? []).map((row: { person_id: string }) => String(row.person_id)),
        ...(guardians ?? []).map((row: { guardian_person_id: string }) =>
          String(row.guardian_person_id),
        ),
      ]),
    ],
  };
}

/**
 * Direcção, Secretaria e Tesouraria vêem todos. O professor vê os alunos das
 * turmas onde dá aulas (e os encarregados deles); aluno e encarregado, os seus.
 * Com vários papéis, junta-se o que cada um dá.
 */
export async function loadStudentScope(
  db: SupabaseClient,
  membership: { schoolId: string; appRole: string; allAppRoles?: readonly string[] },
  userId: string,
): Promise<StudentScope> {
  const roles = membership.allAppRoles?.length ? membership.allAppRoles : [membership.appRole];
  if (roles.some((role) => STUDENT_OFFICE_ROLES.includes(role))) return { all: true };
  const { resolveUserLinkedEntities } = await import("@/features/auth/server");
  const verifiedEmail = await resolveVerifiedAccountEmail(db, userId);
  const linked = await resolveUserLinkedEntities(
    db as never,
    membership.schoolId,
    userId,
    verifiedEmail,
  );
  const childIds = linked.linked_students.map((s) => s.student_id);
  let childPersonIds: string[] = [];
  if (roles.includes("Encarregado") && childIds.length) {
    const { data } = await db
      .from("students")
      .select("person_id")
      .eq("school_id", membership.schoolId)
      .in("id", childIds);
    childPersonIds = (data ?? []).map((row: { person_id: string }) => row.person_id);
  }
  const scopes = roles
    .filter((role) => role === "Aluno" || role === "Encarregado")
    .map((role) => studentScopeFor(role, linked, childPersonIds))
    .filter((scope): scope is Extract<StudentScope, { all: false }> => !scope.all);
  if (roles.includes("Professor")) {
    scopes.push({
      all: false,
      ...(await teacherStudentScope(db, membership.schoolId, linked.teacher_id, linked.person_id)),
    });
  }
  return {
    all: false,
    studentIds: [...new Set(scopes.flatMap((scope) => scope.studentIds))],
    personIds: [
      ...new Set([
        ...(linked.person_id ? [linked.person_id] : []),
        ...scopes.flatMap((scope) => scope.personIds),
      ]),
    ],
  };
}
