/**
 * Pure authorization policy for virtual classroom actions.
 * IMPORTANT: caller must load all these facts from trusted DB queries,
 * not from client JSON, cookies or request headers.
 */
export type ClassroomAction = "create" | "start" | "join" | "end" | "recordings";
export type ClassroomRole = "student" | "teacher" | "pedagogical_admin" | "school_admin";

export type ClassroomAuthorization = {
  authenticatedUserId: string;
  activeSchoolId: string;
  session: {
    id: string;
    schoolId: string;
    teacherId: string;
    classGroupId: string;
    status: "scheduled" | "live" | "ended" | "cancelled";
  };
  membership: {
    userId: string;
    schoolId: string;
    role: ClassroomRole;
    active: boolean;
  } | null;
  enrollment?: {
    studentUserId: string;
    schoolId: string;
    classGroupId: string;
    active: boolean;
  } | null;
  teacherAssignment?: {
    teacherUserId: string;
    teacherId: string;
    schoolId: string;
    active: boolean;
  } | null;
  recordingsPublished?: boolean;
};

export function canAccessVirtualClassroom(
  action: ClassroomAction,
  context: ClassroomAuthorization,
): boolean {
  const {
    authenticatedUserId,
    activeSchoolId,
    session,
    membership,
    enrollment,
    teacherAssignment,
  } = context;
  if (!authenticatedUserId || !activeSchoolId || !session.id) return false;
  if (!membership?.active || membership.userId !== authenticatedUserId) return false;
  if (membership.schoolId !== activeSchoolId || session.schoolId !== activeSchoolId) return false;
  if (session.status === "cancelled") return false;

  const isAdmin = membership.role === "school_admin" || membership.role === "pedagogical_admin";
  const isAssignedTeacher =
    membership.role === "teacher" &&
    teacherAssignment?.teacherId === session.teacherId &&
    teacherAssignment?.active === true &&
    teacherAssignment.schoolId === activeSchoolId &&
    teacherAssignment.teacherUserId === authenticatedUserId;
  const isEnrolledStudent =
    membership.role === "student" &&
    enrollment?.active === true &&
    enrollment.schoolId === activeSchoolId &&
    enrollment.classGroupId === session.classGroupId &&
    enrollment.studentUserId === authenticatedUserId;

  switch (action) {
    case "create":
      return session.status === "scheduled" && (isAdmin || isAssignedTeacher);
    case "start":
      return session.status === "scheduled" && (isAdmin || isAssignedTeacher);
    case "join":
      return session.status === "live" && (isAdmin || isAssignedTeacher || isEnrolledStudent);
    case "end":
      return session.status === "live" && (isAdmin || isAssignedTeacher);
    case "recordings":
      return (
        session.status === "ended" &&
        (isAdmin ||
          isAssignedTeacher ||
          (isEnrolledStudent && context.recordingsPublished === true))
      );
    default:
      return false;
  }
}

export function assertVirtualClassroomAccess(
  action: ClassroomAction,
  context: ClassroomAuthorization,
): void {
  if (!canAccessVirtualClassroom(action, context))
    throw new Error("Virtual classroom access denied");
}
