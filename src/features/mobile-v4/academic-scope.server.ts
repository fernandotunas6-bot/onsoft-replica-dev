import type { requireMobileAcademicAccess, MobileAcademicRole } from "./authorization";
import { MobileApiError } from "./errors";

/** Matrículas que entram na lista da turma e na chamada, como no portal. */
export const ROSTER_ENROLLMENT_STATUSES = ["active", "pending"];

type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];

export interface MobileAcademicScope {
  schoolId: string;
  role: MobileAcademicRole;
  teacherId: string | null;
  studentId: string | null;
  classGroupIds: string[];
  classSubjectIds: string[];
  enrollmentIds: string[];
}

async function rows<T>(
  query: PromiseLike<{
    data: T[] | null;
    error: unknown;
    count: number | null;
  }>,
): Promise<T[]> {
  const result = await query;
  // Supabase can cap a successful response. A truncated roster is not a
  // complete authorization scope; refuse it rather than quietly losing rows.
  if (result.error || !result.data || result.count == null || result.count !== result.data.length) {
    throw new MobileApiError(503, "ACADEMIC_SCOPE_UNAVAILABLE");
  }
  return result.data;
}

/** Called only after requireMobileAcademicAccess has authorized this school/role.
 * Never union the user's other roles: an administrator acting as aluno still
 * sees only their own enrollment. No client IDs or unverified email links.
 */
export async function resolveMobileAcademicScope(
  db: Db,
  userId: string,
  schoolId: string,
  role: MobileAcademicRole,
): Promise<MobileAcademicScope> {
  const { data: person, error: personError } = await db
    .from("people")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (personError) throw new MobileApiError(503, "ACADEMIC_IDENTITY_UNAVAILABLE");

  const scope: MobileAcademicScope = {
    schoolId,
    role,
    teacherId: null,
    studentId: null,
    classGroupIds: [],
    classSubjectIds: [],
    enrollmentIds: [],
  };
  if (role === "professor") {
    const { data: direct, error } = await db
      .from("teachers")
      .select("id, person_id, user_id")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new MobileApiError(503, "ACADEMIC_IDENTITY_UNAVAILABLE");
    if (direct && person && direct.person_id !== person.id) {
      throw new MobileApiError(403, "ACADEMIC_IDENTITY_CONFLICT");
    }
    if (direct && !person) {
      const boundPerson = await db
        .from("people")
        .select("id, user_id")
        .eq("school_id", schoolId)
        .eq("id", direct.person_id)
        .eq("status", "active")
        .is("deleted_at", null)
        .maybeSingle();
      if (boundPerson.error) throw new MobileApiError(503, "ACADEMIC_IDENTITY_UNAVAILABLE");
      if (!boundPerson.data) throw new MobileApiError(403, "ACADEMIC_IDENTITY_REQUIRED");
      if (boundPerson.data.user_id && boundPerson.data.user_id !== userId) {
        throw new MobileApiError(403, "ACADEMIC_IDENTITY_CONFLICT");
      }
    }
    let teacher = direct;
    if (!teacher && person) {
      const linked = await db
        .from("teachers")
        .select("id, person_id, user_id")
        .eq("school_id", schoolId)
        .eq("person_id", person.id)
        .eq("status", "active")
        .maybeSingle();
      if (linked.error) throw new MobileApiError(503, "ACADEMIC_IDENTITY_UNAVAILABLE");
      teacher = linked.data;
      if (teacher?.user_id && teacher.user_id !== userId) {
        throw new MobileApiError(403, "ACADEMIC_IDENTITY_CONFLICT");
      }
    }
    if (!teacher) throw new MobileApiError(403, "ACADEMIC_IDENTITY_REQUIRED");
    scope.teacherId = teacher.id;
  } else {
    if (!person) throw new MobileApiError(403, "ACADEMIC_IDENTITY_REQUIRED");
    const { data: student, error } = await db
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .eq("person_id", person.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new MobileApiError(503, "ACADEMIC_IDENTITY_UNAVAILABLE");
    if (!student) throw new MobileApiError(403, "ACADEMIC_IDENTITY_REQUIRED");
    scope.studentId = student.id;
  }

  const years = await rows<{ id: string }>(
    db
      .from("academic_years")
      .select("id", { count: "exact" })
      .eq("school_id", schoolId)
      .eq("status", "active")
      .limit(1000),
  );
  if (!years.length) return scope;
  const groups = await rows<{ id: string }>(
    db
      .from("class_groups")
      .select("id", { count: "exact" })
      .eq("school_id", schoolId)
      .eq("status", "active")
      .in(
        "academic_year_id",
        years.map((year) => year.id),
      )
      .limit(1000),
  );
  if (!groups.length) return scope;
  const groupIds = groups.map((group) => group.id);

  if (role === "aluno") {
    const enrollments = await rows<{ id: string; class_group_id: string }>(
      db
        .from("enrollments")
        .select("id, class_group_id", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("student_id", scope.studentId!)
        .eq("status", "active")
        .in(
          "academic_year_id",
          years.map((year) => year.id),
        )
        .in("class_group_id", groupIds)
        .limit(1000),
    );
    scope.enrollmentIds = enrollments.map((enrollment) => enrollment.id);
    scope.classGroupIds = [...new Set(enrollments.map((enrollment) => enrollment.class_group_id))];
    if (!scope.classGroupIds.length) return scope;
  }
  let subjectsQuery = db
    .from("class_subjects")
    .select("id, class_group_id", { count: "exact" })
    .eq("school_id", schoolId)
    .eq("status", "active")
    .in("class_group_id", role === "aluno" ? scope.classGroupIds : groupIds);
  if (role === "professor") subjectsQuery = subjectsQuery.eq("teacher_id", scope.teacherId!);
  const subjects = await rows<{ id: string; class_group_id: string }>(subjectsQuery.limit(1000));
  scope.classSubjectIds = subjects.map((subject) => subject.id);
  if (role === "professor") {
    scope.classGroupIds = [...new Set(subjects.map((subject) => subject.class_group_id))];
    if (scope.classGroupIds.length) {
      // A mesma lista da chamada no portal: matrículas activas e pendentes da
      // turma. O aluno só vê as suas matrículas activas.
      const enrollments = await rows<{ id: string }>(
        db
          .from("enrollments")
          .select("id", { count: "exact" })
          .eq("school_id", schoolId)
          .in("status", ROSTER_ENROLLMENT_STATUSES)
          .in(
            "academic_year_id",
            years.map((year) => year.id),
          )
          .in("class_group_id", scope.classGroupIds)
          .limit(1000),
      );
      scope.enrollmentIds = enrollments.map((enrollment) => enrollment.id);
    }
  }
  return scope;
}
