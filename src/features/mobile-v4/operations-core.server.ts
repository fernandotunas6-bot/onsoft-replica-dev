import { requireMobileAcademicAccess } from "./authorization";
import { MobileApiError } from "./errors";
import { mobileCommandRequestSchema, mobileScopeSchema } from "./schemas";
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
  await requireMobileAcademicAccess(userId, data.schoolId, data.role, "write");
  throw new MobileApiError(503, "COMMANDS_NOT_READY");
}
