/** Isolated backend extension: notices and published results.
 *
 * The canonical services for these two areas (notifications and results) are
 * not part of this checkout, so this file is the contract the Flutter client
 * reads, not a proven port of the production one. Two domain rules decide the
 * shape, both from docs/AUDITORIA_E_PLANO.md:
 *
 * - A grade carries its own scale. Nothing here assumes 0–20, and an entry
 *   without a usable scale is a service failure, not a grade to display.
 * - A grade exists for the reader only once the school publishes it. An
 *   unpublished entry never travels with a value.
 *
 * This handler is not mounted on the published Worker until integration checks.
 */
export type Role = "professor" | "aluno";
export type Scope = { schoolId: string; role: Role };
export type Identity = { userId: string; aal: string | null };
export type Notice = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  category?: string | null;
  read?: boolean;
  [key: string]: unknown;
};
export type Result = {
  id: string;
  classSubjectId: string;
  subjectName: string;
  termName: string;
  kind: string;
  status: "published" | "pending";
  value: number | null;
  scaleMax: number | null;
  publishedAt: string | null;
  [key: string]: unknown;
};
export type NoticeFeed = Scope & { items: Notice[]; nextCursor?: string | null };
export type ResultSheet = Scope & { items: Result[] };
export type RecordDependencies = {
  authenticate: (bearer: string) => Promise<Identity>;
  /** Must perform fresh active-membership/role/module checks on every call. */
  notices: (userId: string, scope: Scope) => Promise<NoticeFeed>;
  /** Must return only what this reader may see: never another person's marks. */
  results: (userId: string, scope: Scope) => Promise<ResultSheet>;
};

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const LIMIT = 1000;

export class RecordFailure extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const fail = (status: number, code: string): never => {
  throw new RecordFailure(status, code);
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
function scopeFrom(url: URL, schoolId: string): Scope {
  const role = url.searchParams.get("role");
  if (!uuid.test(schoolId) || (role !== "professor" && role !== "aluno")) {
    fail(422, "INVALID_SCOPE");
  }
  if (
    [...url.searchParams.keys()].some((key) => key !== "role") ||
    url.searchParams.getAll("role").length !== 1
  ) {
    fail(422, "UNKNOWN_QUERY_FIELD");
  }
  return { schoolId, role: role as Role };
}
const isText = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const isInstant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function validateEnvelope(payload: Scope & { items: unknown[] }, scope: Scope, code: string) {
  if (
    !payload ||
    payload.schoolId !== scope.schoolId ||
    payload.role !== scope.role ||
    !Array.isArray(payload.items) ||
    payload.items.length > LIMIT
  ) {
    fail(503, code);
  }
}
/** Explicit allowlist: a growing canonical record must not start exporting
 * author ids, internal notes or recipients by accident. */
function notice(item: Notice) {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    publishedAt: item.publishedAt,
    category: item.category ?? null,
    read: item.read === true,
  };
}
function result(item: Result) {
  const published = item.status === "published";
  return {
    id: item.id,
    classSubjectId: item.classSubjectId,
    subjectName: item.subjectName,
    termName: item.termName,
    kind: item.kind,
    status: item.status,
    // An unpublished entry never travels with a value: a draft mark shown as
    // a grade is worse than no grade at all.
    value: published ? item.value : null,
    scaleMax: published ? item.scaleMax : null,
    publishedAt: published ? item.publishedAt : null,
  };
}

export async function handleRecords(
  request: Request,
  deps: RecordDependencies,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = /^\/api\/mobile-v4\/schools\/([^/]+)\/(notices|results)$/.exec(url.pathname);
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
    const scope = scopeFrom(url, match[1]);
    const bearer = request.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ") || !bearer.slice(7).trim()) fail(401, "SESSION_REQUIRED");
    let identity: Identity;
    try {
      identity = await deps.authenticate(bearer!);
    } catch {
      return response({ error: "SESSION_REQUIRED" }, 401);
    }
    if (!identity?.userId) fail(401, "SESSION_REQUIRED");
    const envelope = {
      version: 1,
      schoolId: scope.schoolId,
      role: scope.role,
      userId: identity.userId,
    };
    if (match[2] === "notices") {
      const feed = await deps.notices(identity.userId, scope);
      validateEnvelope(feed, scope, "NOTICES_INVALID");
      const ids = new Set<string>();
      for (const item of feed.items) {
        if (
          !item ||
          !uuid.test(String(item.id)) ||
          ids.has(item.id) ||
          !isText(item.title, 300) ||
          typeof item.body !== "string" ||
          item.body.length > 20000 ||
          !isInstant(item.publishedAt) ||
          (item.category != null && !isText(item.category, 80)) ||
          (item.read != null && typeof item.read !== "boolean")
        ) {
          fail(503, "NOTICES_INVALID");
        }
        ids.add(item.id);
      }
      if (feed.nextCursor != null && !isText(feed.nextCursor, 500)) {
        fail(503, "NOTICES_INVALID");
      }
      return response({
        ...envelope,
        items: feed.items.map(notice),
        // Declared so the client can say there is more instead of showing a
        // truncated feed as if it were complete.
        nextCursor: feed.nextCursor ?? null,
      });
    }
    const sheet = await deps.results(identity.userId, scope);
    validateEnvelope(sheet, scope, "RESULTS_INVALID");
    const ids = new Set<string>();
    for (const item of sheet.items) {
      const published = item?.status === "published";
      if (
        !item ||
        !uuid.test(String(item.id)) ||
        ids.has(item.id) ||
        !uuid.test(String(item.classSubjectId)) ||
        !isText(item.subjectName, 200) ||
        !isText(item.termName, 120) ||
        !isText(item.kind, 80) ||
        (item.status !== "published" && item.status !== "pending")
      ) {
        fail(503, "RESULTS_INVALID");
      }
      if (published) {
        // The scale comes from the school. Without it there is no way to read
        // the number, so refuse instead of assuming 0–20.
        if (
          typeof item.value !== "number" ||
          !Number.isFinite(item.value) ||
          typeof item.scaleMax !== "number" ||
          !Number.isFinite(item.scaleMax) ||
          item.scaleMax <= 0 ||
          item.value < 0 ||
          item.value > item.scaleMax ||
          !isInstant(item.publishedAt)
        ) {
          fail(503, "RESULTS_INVALID");
        }
      }
      ids.add(item.id);
    }
    return response({ ...envelope, items: sheet.items.map(result) });
  } catch (error) {
    if (error instanceof RecordFailure) return response({ error: error.code }, error.status);
    return response({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
}
