import { parseAcademicAttendance } from "../../../mobile-v4/src/domain/attendance-validation";
import { requireMobileAcademicAccess } from "./authorization";
import { MobileApiError } from "./errors";
import {
  mobileCommandRequestSchema,
  mobileScopeSchema,
  mobileAttendanceScopeSchema,
} from "./schemas";
import { resolveMobileAcademicScope } from "./academic-scope.server";
import { readMobileAcademicCatalog } from "./academic-catalog.server";

/** Canonical read endpoint, independently of the unfinished legacy workspace. */
export async function loadMobileV4AcademicCatalog(userId: string, input: unknown) {
  const inputScope = mobileScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(
    userId,
    inputScope.schoolId,
    inputScope.role,
    "read",
  );
  const scope = await resolveMobileAcademicScope(db, userId, inputScope.schoolId, inputScope.role);
  return readMobileAcademicCatalog(db, scope, userId);
}

// Until the academic projection and atomic persistence are validated against
// an isolated database, these routes must never report success or fake data.
export async function loadMobileV4Workspace(userId: string, input: unknown) {
  const scope = mobileScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(userId, scope.schoolId, scope.role, "read");
  await resolveMobileAcademicScope(db, userId, scope.schoolId, scope.role);
  throw new MobileApiError(503, "WORKSPACE_NOT_READY");
}

export async function applyMobileV4Command(userId: string, input: unknown) {
  const data = mobileCommandRequestSchema.parse(input);
  const studentCommand = ["submission", "document"].includes(data.command.type);
  if (data.command.type !== "message" && (studentCommand ? "aluno" : "professor") !== data.role) {
    throw new MobileApiError(403, "COMMAND_ROLE_FORBIDDEN");
  }
  if (data.command.type === "attendance") {
    const { recordMobileV4Attendance } = await import("./teacher-attendance.server");
    return recordMobileV4Attendance(userId, { ...data, command: data.command });
  }
  await requireMobileAcademicAccess(userId, data.schoolId, data.role, "write");
  throw new MobileApiError(503, "COMMANDS_NOT_READY");
}

export async function loadMobileV4Attendance(userId: string, input: unknown) {
  const range = mobileAttendanceScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(userId, range.schoolId, range.role, "read");
  const scope = await resolveMobileAcademicScope(db, userId, range.schoolId, range.role);
  const catalog = await readMobileAcademicCatalog(db, scope, userId);
  const { readMobileAttendance } = await import("./attendance.server");
  const data = await readMobileAttendance(db, scope, catalog, { from: range.from, to: range.to });
  try {
    return parseAcademicAttendance(
      data,
      { userId, schoolId: scope.schoolId, role: scope.role },
      catalog,
      range,
    );
  } catch {
    throw new MobileApiError(503, "ATTENDANCE_INCONSISTENT");
  }
}

export async function loadMobileV4Results(userId: string, input: unknown) {
  const requested = mobileScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(
    userId,
    requested.schoolId,
    requested.role,
    "read",
  );
  if (requested.role !== "aluno") throw new MobileApiError(403, "RESULTS_STUDENT_ONLY");
  const scope = await resolveMobileAcademicScope(db, userId, requested.schoolId, requested.role);
  const catalog = await readMobileAcademicCatalog(db, scope, userId);
  const { readMobileResults } = await import("./results.server");
  return readMobileResults(db, scope, catalog, userId);
}

export async function loadMobileV4Lessons(userId: string, input: unknown) {
  const { loadMobileV4TeacherDay } = await import("./teacher-attendance.server");
  return loadMobileV4TeacherDay(userId, input);
}
