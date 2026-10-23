/** Isolated backend extension: read-only history of one conversation.
 *
 * The canonical chat services are not part of this checkout, so this is the
 * contract the Flutter client reads, not a proven port. Read only on purpose:
 * sending, attachments and Realtime need write endpoints, storage policies and
 * installed capabilities that cannot be verified from this repository, and the
 * client must not grow a send button that has nowhere to post.
 *
 * Attachments travel as a name and a size, never as a URL: a link to school
 * storage has to be signed per request by the server that owns the policy.
 *
 * This handler is not mounted on the published Worker until integration checks.
 */
export type Role = "professor" | "aluno";
export type Scope = { schoolId: string; role: Role };
export type Identity = { userId: string; aal: string | null };
export type Message = {
  id: string;
  authorName: string;
  mine: boolean;
  body: string;
  sentAt: string;
  attachments?: { name: string; bytes: number }[] | null;
  [key: string]: unknown;
};
export type History = Scope & {
  threadId: string;
  threadName: string;
  messages: Message[];
  /** Older page, when the service has one. */
  previousCursor?: string | null;
};
export type ChatDependencies = {
  authenticate: (bearer: string) => Promise<Identity>;
  /** Must re-check membership of this thread on every call, never by id alone. */
  history: (userId: string, scope: Scope, threadId: string) => Promise<History>;
};

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const LIMIT = 500;

export class ChatFailure extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const fail = (status: number, code: string): never => {
  throw new ChatFailure(status, code);
};
function response(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...extra,
    },
  });
}
const isText = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max;

export async function handleChatHistory(
  request: Request,
  deps: ChatDependencies,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = /^\/api\/mobile-v4\/schools\/([^/]+)\/chat\/threads\/([^/]+)$/.exec(
      url.pathname,
    );
    if (!match) return response({ error: "NOT_FOUND" }, 404);
    if (request.method !== "GET") {
      return response({ error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "GET" });
    }
    const origin = request.headers.get("Origin");
    if (
      (origin && origin !== url.origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site"
    ) {
      fail(403, "ORIGIN_FORBIDDEN");
    }
    const role = url.searchParams.get("role");
    if (!uuid.test(match[1]) || (role !== "professor" && role !== "aluno")) {
      fail(422, "INVALID_SCOPE");
    }
    if (
      [...url.searchParams.keys()].some((key) => key !== "role") ||
      url.searchParams.getAll("role").length !== 1
    ) {
      fail(422, "UNKNOWN_QUERY_FIELD");
    }
    if (!uuid.test(match[2])) fail(422, "INVALID_THREAD");
    const scope: Scope = { schoolId: match[1], role: role as Role };
    const bearer = request.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ") || !bearer.slice(7).trim()) fail(401, "SESSION_REQUIRED");
    let identity: Identity;
    try {
      identity = await deps.authenticate(bearer!);
    } catch {
      return response({ error: "SESSION_REQUIRED" }, 401);
    }
    if (!identity?.userId) fail(401, "SESSION_REQUIRED");
    let history: History;
    try {
      history = await deps.history(identity.userId, scope, match[2]);
    } catch (error) {
      if (error instanceof ChatFailure) throw error;
      fail(503, "HISTORY_UNAVAILABLE");
      throw error;
    }
    // Absent and unauthorized answer the same: no existence lookup.
    if (!history) fail(404, "THREAD_NOT_AVAILABLE");
    if (
      history.schoolId !== scope.schoolId ||
      history.role !== scope.role ||
      history.threadId !== match[2] ||
      !isText(history.threadName, 300) ||
      !Array.isArray(history.messages) ||
      history.messages.length > LIMIT
    ) {
      fail(503, "HISTORY_INVALID");
    }
    const ids = new Set<string>();
    for (const message of history.messages) {
      if (
        !message ||
        !uuid.test(String(message.id)) ||
        ids.has(message.id) ||
        !isText(message.authorName, 200) ||
        typeof message.mine !== "boolean" ||
        typeof message.body !== "string" ||
        message.body.length > 20000 ||
        typeof message.sentAt !== "string" ||
        !Number.isFinite(Date.parse(message.sentAt)) ||
        (message.attachments != null &&
          (!Array.isArray(message.attachments) ||
            message.attachments.length > 20 ||
            message.attachments.some(
              (file) =>
                !file ||
                !isText(file.name, 300) ||
                typeof file.bytes !== "number" ||
                !Number.isFinite(file.bytes) ||
                file.bytes < 0,
            )))
      ) {
        fail(503, "HISTORY_INVALID");
      }
      ids.add(message.id);
    }
    if (history.previousCursor != null && !isText(history.previousCursor, 500)) {
      fail(503, "HISTORY_INVALID");
    }
    return response({
      version: 1,
      schoolId: scope.schoolId,
      role: scope.role,
      userId: identity.userId,
      threadId: history.threadId,
      threadName: history.threadName,
      // Allowlist: no author userId, e-mail, phone, storage path or signed URL.
      messages: history.messages.map((message) => ({
        id: message.id,
        authorName: message.authorName,
        mine: message.mine,
        body: message.body,
        sentAt: message.sentAt,
        attachments: (message.attachments ?? []).map((file) => ({
          name: file.name,
          bytes: file.bytes,
        })),
      })),
      previousCursor: history.previousCursor ?? null,
    });
  } catch (error) {
    if (error instanceof ChatFailure) return response({ error: error.code }, error.status);
    return response({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
}
