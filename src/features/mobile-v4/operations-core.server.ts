import { parseAcademicAttendance } from "../../../mobile-v4/src/domain/attendance-validation";
import { requireMobileAcademicAccess } from "./authorization";
import { MobileApiError } from "./errors";
import {
  mobileCommandRequestSchema,
  mobileScopeSchema,
  mobileAttendanceScopeSchema,
  mobileChatScopeSchema,
  mobileChatAttachmentSchema,
  mobileChatCommandRequestSchema,
  mobileNotificationsScopeSchema,
  mobileNotificationsReadSchema,
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

export async function loadMobileV4Gradebooks(userId: string, input: unknown) {
  const requested = mobileScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(
    userId,
    requested.schoolId,
    requested.role,
    "read",
  );
  if (requested.role !== "professor") throw new MobileApiError(403, "GRADEBOOKS_TEACHER_ONLY");
  const scope = await resolveMobileAcademicScope(db, userId, requested.schoolId, requested.role);
  const catalog = await readMobileAcademicCatalog(db, scope, userId);
  const { readMobileGradebooks } = await import("./gradebooks.server");
  return readMobileGradebooks(db, scope, catalog, userId);
}

export async function loadMobileV4Finance(userId: string, input: unknown) {
  const requested = mobileScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(
    userId,
    requested.schoolId,
    requested.role,
    "read",
  );
  if (requested.role !== "aluno") throw new MobileApiError(403, "FINANCE_STUDENT_ONLY");
  const scope = await resolveMobileAcademicScope(db, userId, requested.schoolId, requested.role);
  const { readMobileFinance } = await import("./finance.server");
  return readMobileFinance(db, scope, userId);
}

export async function loadMobileV4Chat(userId: string, input: unknown) {
  const requested = mobileChatScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(
    userId,
    requested.schoolId,
    requested.role,
    "read",
  );
  const scope = await resolveMobileAcademicScope(db, userId, requested.schoolId, requested.role);
  const { readMobileChat } = await import("./chat.server");
  return readMobileChat(
    db,
    scope,
    userId,
    requested.conversationId,
    requested.before ? { date: requested.before, id: requested.beforeId! } : undefined,
  );
}

export async function loadMobileV4ChatContacts(userId: string, input: unknown) {
  const s = mobileScopeSchema.parse(input);
  const { db, membership } = await requireMobileAcademicAccess(userId, s.schoolId, s.role, "read");
  const { readMobileChatContacts } = await import("./chat-files.server");
  return {
    ...s,
    userId,
    contacts: await readMobileChatContacts(db, s.schoolId, userId, membership.allAppRoles),
  };
}
export async function loadMobileV4ChatAttachment(userId: string, input: unknown) {
  const s = mobileChatAttachmentSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(userId, s.schoolId, s.role, "read");
  const { signMobileChatAttachment } = await import("./chat-files.server");
  return signMobileChatAttachment(db, s.schoolId, userId, s.messageId);
}

export async function applyMobileV4ChatCommand(userId: string, input: unknown) {
  const data = mobileChatCommandRequestSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(userId, data.schoolId, data.role, "write");
  const { applyMobileChatCommand } = await import("./chat-commands.server");
  return applyMobileChatCommand(db, userId, data);
}

export async function loadMobileV4ChatCapabilities(userId: string, input: unknown) {
  const data = mobileScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(userId, data.schoolId, data.role, "read");
  const { readMobileChatCapabilities } = await import("./chat-commands.server");
  return readMobileChatCapabilities(db);
}

export async function loadMobileV4Notifications(userId: string, input: unknown) {
  const s = mobileNotificationsScopeSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(userId, s.schoolId, s.role, "read");
  const { readMobileNotifications } = await import("./notifications.server");
  return readMobileNotifications(
    db,
    { schoolId: s.schoolId, role: s.role, userId },
    s.before && s.beforeId ? { date: s.before, id: s.beforeId } : undefined,
  );
}

/**
 * Marcar os próprios avisos como lidos. Acesso de leitura ao módulo chega: é o
 * estado da caixa da própria pessoa, não um dado da escola (o SIGA faz o mesmo
 * com a sessão do utilizador). O 2FA é exigido pelo adaptador HTTP.
 */
export async function applyMobileV4NotificationsRead(userId: string, input: unknown) {
  const s = mobileNotificationsReadSchema.parse(input);
  const { db } = await requireMobileAcademicAccess(userId, s.schoolId, s.role, "read");
  const { markMobileNotificationsRead } = await import("./notifications.server");
  return markMobileNotificationsRead(
    db,
    { schoolId: s.schoolId, role: s.role, userId },
    "ids" in s ? { ids: s.ids } : { all: true },
  );
}
