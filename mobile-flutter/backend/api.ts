/** Isolated backend extension. Supply existing verified session/catalog services.
 * This handler is not mounted on the published Worker until integration checks.
 */
export type Role = "professor" | "aluno";
export type Scope = { schoolId: string; role: Role };
export type Identity = { userId: string; aal: string | null };
export type Subject = {
  classGroupId: string;
  classSubjectId: string;
  academicYearId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacher: { name: string } | null;
};
export type Catalog = Scope & {
  classes: Subject[];
  timetable: { classSubjectId: string; [key: string]: unknown }[];
  tasks: { classSubjectId: string; [key: string]: unknown }[];
};
export type Dependencies = {
  authenticate: (bearer: string) => Promise<Identity>;
  /** Must perform fresh active-membership/role/module checks on every call. */
  academicCatalog: (userId: string, scope: Scope) => Promise<Catalog>;
};
export class ApiFailure extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string): never => {
  throw new ApiFailure(status, code);
};
function scopeFrom(url: URL, schoolId: string): Scope {
  const role = url.searchParams.get("role");
  if (!uuid.test(schoolId) || (role !== "professor" && role !== "aluno"))
    fail(422, "INVALID_SCOPE");
  if (
    [...url.searchParams.keys()].some((k) => k !== "role") ||
    url.searchParams.getAll("role").length !== 1
  ) {
    fail(422, "UNKNOWN_QUERY_FIELD");
  }
  return { schoolId, role: role as Role };
}
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
function validateCatalog(catalog: Catalog, scope: Scope) {
  if (
    !catalog ||
    catalog.schoolId !== scope.schoolId ||
    catalog.role !== scope.role ||
    !Array.isArray(catalog.classes) ||
    !Array.isArray(catalog.timetable) ||
    !Array.isArray(catalog.tasks) ||
    [catalog.classes, catalog.timetable, catalog.tasks].some((list) => list.length > 1000)
  )
    fail(503, "CATALOG_INVALID");
  const ids = new Set<string>();
  for (const c of catalog.classes) {
    if (
      !c ||
      !uuid.test(c.classGroupId) ||
      !uuid.test(c.classSubjectId) ||
      !uuid.test(c.subjectId) ||
      !uuid.test(c.academicYearId) ||
      (c.teacher != null &&
        (typeof c.teacher !== "object" || typeof c.teacher.name !== "string")) ||
      typeof c.className !== "string" ||
      typeof c.subjectName !== "string" ||
      ids.has(c.classSubjectId)
    ) {
      fail(503, "CATALOG_INVALID");
    }
    ids.add(c.classSubjectId);
  }
  const taskIds = new Set<string>();
  for (const t of catalog.tasks) {
    if (
      !t ||
      typeof t.id !== "string" ||
      !uuid.test(t.id) ||
      taskIds.has(t.id) ||
      typeof t.title !== "string" ||
      typeof t.kind !== "string" ||
      (t.instructions != null && typeof t.instructions !== "string") ||
      (t.due != null && (typeof t.due !== "string" || !Number.isFinite(Date.parse(t.due))))
    )
      fail(503, "CATALOG_INVALID");
    taskIds.add(t.id as string);
  }
  if ([...catalog.timetable, ...catalog.tasks].some((x) => !x || !ids.has(x.classSubjectId)))
    fail(503, "CATALOG_INVALID");
}
/** Explicit allowlist avoids accidentally exporting rosters, user IDs or future
 * sensitive fields when the canonical catalog grows. */
function subject(c: Subject) {
  return {
    classSubjectId: c.classSubjectId,
    subjectId: c.subjectId,
    subjectName: c.subjectName,
    teacherName: c.teacher?.name ?? null,
  };
}
export async function handleInstitutionalExtension(
  request: Request,
  deps: Dependencies,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = /^\/api\/mobile-v4\/schools\/([^/]+)\/(classes|tasks)(?:\/([^/]+))?$/.exec(
      url.pathname,
    );
    if (!match) return response({ error: "NOT_FOUND" }, 404);
    if (request.method !== "GET")
      return response({ error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "GET" });
    const origin = request.headers.get("Origin");
    if ((origin && origin !== url.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site")
      fail(403, "ORIGIN_FORBIDDEN");
    const scope = scopeFrom(url, match[1]);
    const operation = match[2];
    const resourceId = match[3];
    const classGroupId = operation === "classes" ? resourceId : undefined;
    if (resourceId && !uuid.test(resourceId)) fail(422, "INVALID_CLASS");
    const bearer = request.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ") || !bearer.slice(7).trim()) fail(401, "SESSION_REQUIRED");
    let identity: Identity;
    try {
      identity = await deps.authenticate(bearer!);
    } catch {
      return response({ error: "SESSION_REQUIRED" }, 401);
    }
    if (!identity?.userId) fail(401, "SESSION_REQUIRED");
    const catalog = await deps.academicCatalog(identity.userId, scope);
    validateCatalog(catalog, scope);
    if (operation === "tasks") {
      const items = catalog.tasks.map((t) => ({
        id: t.id,
        classSubjectId: t.classSubjectId,
        kind: t.kind,
        title: t.title,
        instructions: t.instructions,
        due: t.due,
      }));
      const envelope = { version: 1, schoolId: scope.schoolId, role: scope.role };
      if (!resourceId) return response({ ...envelope, items });
      const item = items.find((t) => t.id === resourceId);
      if (!item) fail(404, "TASK_NOT_AVAILABLE");
      return response({ ...envelope, item });
    }
    const groups = new Map<string, Subject[]>();
    for (const c of catalog.classes) {
      const list = groups.get(c.classGroupId) ?? [];
      if (list.some((x) => x.className !== c.className || x.academicYearId !== c.academicYearId))
        fail(503, "CATALOG_INVALID");
      list.push(c);
      groups.set(c.classGroupId, list);
    }
    const envelope = { version: 1, schoolId: scope.schoolId, role: scope.role };
    if (!classGroupId)
      return response({
        ...envelope,
        items: [...groups].map(([id, list]) => ({
          id,
          name: list[0].className,
          academicYearId: list[0].academicYearId,
          subjects: list.map(subject),
        })),
      });
    const list = groups.get(classGroupId);
    // Same response for absent and unauthorized classes; no existence lookup.
    if (!list) fail(404, "CLASS_NOT_AVAILABLE");
    const ids = new Set(list!.map((c) => c.classSubjectId));
    return response({
      ...envelope,
      item: {
        id: classGroupId,
        name: list![0].className,
        academicYearId: list![0].academicYearId,
        subjects: list!.map(subject),
        timetable: catalog.timetable
          .filter((s) => ids.has(s.classSubjectId))
          .map((s) => ({
            slotId: s.slotId,
            classSubjectId: s.classSubjectId,
            weekday: s.weekday,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            room: s.room,
            publication: s.publication,
            validFrom: s.validFrom,
            validTo: s.validTo,
          })),
        tasks: catalog.tasks
          .filter((t) => ids.has(t.classSubjectId))
          .map((t) => ({
            id: t.id,
            classSubjectId: t.classSubjectId,
            kind: t.kind,
            title: t.title,
            instructions: t.instructions,
            due: t.due,
          })),
      },
    });
  } catch (error) {
    if (error instanceof ApiFailure) return response({ error: error.code }, error.status);
    return response({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
}
