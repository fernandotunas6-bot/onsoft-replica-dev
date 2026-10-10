import { ZodError } from "zod";
import { resolveBearerSession } from "@/features/saas/platform-guard";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { loadMobileV4Session } from "./session-core.server";
import {
  loadMobileV4Workspace,
  applyMobileV4Command,
  loadMobileV4AcademicCatalog,
  loadMobileV4Attendance,
  loadMobileV4Results,
  loadMobileV4Gradebooks,
  loadMobileV4Finance,
  loadMobileV4Chat,
  loadMobileV4ChatContacts,
  loadMobileV4ChatAttachment,
  applyMobileV4ChatCommand,
  loadMobileV4ChatCapabilities,
  loadMobileV4Notifications,
  applyMobileV4NotificationsRead,
} from "./operations-core.server";
import { MobileApiError } from "./errors";
import {
  mobileRoleSchema,
  mobileScopeSchema,
  mobileCommandRequestSchema,
  mobileAttendanceScopeSchema,
  mobileChatScopeSchema,
  mobileChatAttachmentSchema,
  mobileChatCommandRequestSchema,
  mobileNotificationsScopeSchema,
  mobileNotificationsReadSchema,
} from "./schemas";

type Identity = { userId: string; aal: string | null };
export type MobileHttpDependencies = {
  authenticate: (authorization: string | null) => Promise<Identity>;
  session: (userId: string) => Promise<unknown>;
  workspace: (userId: string, scope: unknown) => Promise<unknown>;
  capabilities: (userId: string, scope: unknown) => Promise<unknown>;
  contacts: (userId: string, scope: unknown) => Promise<unknown>;
  attachment: (userId: string, scope: unknown) => Promise<unknown>;
  notifications: (userId: string, scope: unknown) => Promise<unknown>;
  chat: (userId: string, scope: unknown) => Promise<unknown>;
  finance: (userId: string, scope: unknown) => Promise<unknown>;
  gradebooks: (userId: string, scope: unknown) => Promise<unknown>;
  results: (userId: string, scope: unknown) => Promise<unknown>;
  attendance: (userId: string, scope: unknown) => Promise<unknown>;
  academic: (userId: string, scope: unknown) => Promise<unknown>;
  chatCommand: (userId: string, scope: unknown) => Promise<unknown>;
  notificationsRead: (userId: string, input: unknown) => Promise<unknown>;
  command: (userId: string, input: unknown) => Promise<unknown>;
  logout: (token: string) => Promise<void>;
};
const dependencies: MobileHttpDependencies = {
  authenticate: resolveBearerSession,
  session: loadMobileV4Session,
  workspace: loadMobileV4Workspace,
  academic: loadMobileV4AcademicCatalog,
  attendance: loadMobileV4Attendance,
  results: loadMobileV4Results,
  gradebooks: loadMobileV4Gradebooks,
  finance: loadMobileV4Finance,
  chat: loadMobileV4Chat,
  notifications: loadMobileV4Notifications,
  contacts: loadMobileV4ChatContacts,
  capabilities: loadMobileV4ChatCapabilities,
  attachment: loadMobileV4ChatAttachment,
  command: applyMobileV4Command,
  chatCommand: applyMobileV4ChatCommand,
  notificationsRead: applyMobileV4NotificationsRead,
  logout: async (token) => {
    const db = await loadSgaAdminClient();
    const { error } = await db.auth.admin.signOut(token, "local");
    if (error) throw new MobileApiError(503, "LOGOUT_UNAVAILABLE");
  },
};

const BODY_LIMIT = 65536;
async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new MobileApiError(415, "JSON_REQUIRED");
  }
  if (Number(request.headers.get("content-length")) > BODY_LIMIT) {
    throw new MobileApiError(413, "BODY_TOO_LARGE");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new MobileApiError(422, "INVALID_JSON");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw new MobileApiError(413, "BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new MobileApiError(422, "INVALID_JSON");
  }
}

function respond(body: unknown, status = 200, allow?: string): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Origin",
      "X-Content-Type-Options": "nosniff",
      ...(allow ? { Allow: allow } : {}),
    },
  });
}

/** Plain HTTP adapter: authenticated identity is resolved once on the server.
 * No cookie fallback, permissive CORS, client userId, or error detail exposure.
 */
export async function handleMobileV4Http(request: Request, deps = dependencies): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const schoolRoute =
      /^\/api\/mobile-v4\/schools\/([0-9a-f-]+)\/(workspace|academic|attendance|results|gradebooks|finance|notifications|notifications-read|chat|contacts|attachment|chat-capabilities|chat-commands|commands)$/i.exec(
        path,
      );
    const operation =
      path === "/api/mobile-v4/session"
        ? "session"
        : path === "/api/mobile-v4/logout"
          ? "logout"
          : schoolRoute?.[2];
    if (!operation) return respond({ error: "NOT_FOUND" }, 404);
    const method = [
      "chat-capabilities",
      "contacts",
      "attachment",
      "session",
      "workspace",
      "academic",
      "attendance",
      "results",
      "gradebooks",
      "finance",
      "notifications",
      "chat",
    ].includes(operation)
      ? "GET"
      : "POST";
    if (request.method !== method) return respond({ error: "METHOD_NOT_ALLOWED" }, 405, method);
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== url.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      throw new MobileApiError(403, "ORIGIN_FORBIDDEN");
    }
    const authorization = request.headers.get("authorization");
    let identity: Identity;
    try {
      identity = await deps.authenticate(authorization);
    } catch {
      throw new MobileApiError(401, "SESSION_REQUIRED");
    }
    if (!identity.userId) throw new MobileApiError(401, "SESSION_REQUIRED");
    if (operation === "session") return respond(await deps.session(identity.userId));
    if (operation === "logout") {
      // Logout must also work for a valid aal1 session with no enrolled factor.
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
        throw new MobileApiError(422, "INVALID_LOGOUT");
      }
      const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      if (!token) throw new MobileApiError(401, "SESSION_REQUIRED");
      await deps.logout(token);
      return respond(null, 204);
    }
    const schoolId = schoolRoute![1];
    if (operation === "chat-capabilities")
      return respond(
        await deps.capabilities(
          identity.userId,
          mobileScopeSchema.parse({ schoolId, role: url.searchParams.get("role") }),
        ),
      );
    if (operation === "attachment")
      return respond(
        await deps.attachment(
          identity.userId,
          mobileChatAttachmentSchema.parse({
            schoolId,
            role: url.searchParams.get("role"),
            messageId: url.searchParams.get("messageId"),
          }),
        ),
      );
    if (operation === "contacts")
      return respond(
        await deps.contacts(
          identity.userId,
          mobileScopeSchema.parse({ schoolId, role: url.searchParams.get("role") }),
        ),
      );
    if (operation === "chat") {
      const scope = mobileChatScopeSchema.parse({
        schoolId,
        role: url.searchParams.get("role"),
        conversationId: url.searchParams.get("conversationId") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
        beforeId: url.searchParams.get("beforeId") ?? undefined,
      });
      return respond(await deps.chat(identity.userId, scope));
    }
    if (operation === "attendance") {
      const scope = mobileAttendanceScopeSchema.parse({
        schoolId,
        role: url.searchParams.get("role"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      });
      return respond(await deps.attendance(identity.userId, scope));
    }
    if (operation === "notifications") {
      const scope = mobileNotificationsScopeSchema.parse({
        schoolId,
        role: url.searchParams.get("role"),
        before: url.searchParams.get("before") ?? undefined,
        beforeId: url.searchParams.get("beforeId") ?? undefined,
      });
      return respond(await deps.notifications(identity.userId, scope));
    }
    if (
      operation === "workspace" ||
      operation === "academic" ||
      operation === "results" ||
      operation === "gradebooks" ||
      operation === "finance"
    ) {
      const role = mobileRoleSchema.parse(url.searchParams.get("role"));
      const scope = mobileScopeSchema.parse({ schoolId, role });
      return respond(await deps[operation](identity.userId, scope));
    }
    if (identity.aal !== "aal2") throw new MobileApiError(403, "MFA_REQUIRED");
    const body = await readJson(request);
    // schoolId only comes from the route; unknown body fields are rejected.
    if (!body || typeof body !== "object" || Array.isArray(body) || "schoolId" in body) {
      throw new MobileApiError(422, "INVALID_COMMAND");
    }
    if (operation === "notifications-read")
      return respond(
        await deps.notificationsRead(
          identity.userId,
          mobileNotificationsReadSchema.parse({ ...body, schoolId }),
        ),
      );
    if (operation === "chat-commands")
      return respond(
        await deps.chatCommand(
          identity.userId,
          mobileChatCommandRequestSchema.parse({ ...body, schoolId }),
        ),
      );
    const input = mobileCommandRequestSchema.parse({ ...body, schoolId });
    return respond(await deps.command(identity.userId, input));
  } catch (error) {
    if (error instanceof MobileApiError) return respond({ error: error.code }, error.status);
    if (error instanceof ZodError) return respond({ error: "VALIDATION_FAILED" }, 422);
    return respond({ error: "INTERNAL_ERROR" }, 500);
  }
}
