/** Isolated backend extension. Supply existing verified session/catalog services.
 * This handler is not mounted on the published Worker until integration checks.
 */
export type Role = 'professor' | 'aluno';
export type Scope = { schoolId: string; role: Role };
export type Identity = { userId: string; aal: string | null };
export type Subject = {
  classGroupId: string; classSubjectId: string; academicYearId: string;
  className: string; subjectId: string; subjectName: string;
  teacher: { name: string } | null;
};
export type Catalog = Scope & {
  classes: Subject[];
  timetable: { classSubjectId: string; [key: string]: unknown }[];
  tasks: { classSubjectId: string; [key: string]: unknown }[];
};
/** Only published results may reach a device. The scale comes from the school
 * record; never presume 0-20. A grade is not recomputed or rounded here. */
export type Grade = { code: string; label: string; value: number | null };
export type Result = {
  classSubjectId: string; termId: string; termName: string;
  publication: 'published'; scaleMax: number; grades: Grade[];
  finalGrade: number | null; status: string | null;
};
/** studentId must be the authenticated pupil: this endpoint never serves the
 * results of a third party, and no roster is derived from academic access. */
export type ResultSet = Scope & { studentId: string; items: Result[] };
export type Notice = {
  id: string; title: string; body: string; publishedAt: string;
  audience: 'school' | 'class' | 'subject';
  classSubjectId: string | null; pinned: boolean;
};
export type NoticeFeed = Scope & { items: Notice[]; nextCursor: string | null };
export type Dependencies = {
  authenticate: (bearer: string) => Promise<Identity>;
  /** Must perform fresh active-membership/role/module checks on every call. */
  academicCatalog: (userId: string, scope: Scope) => Promise<Catalog>;
  /** Must return published results of this pupil only, already filtered. */
  academicResults?: (userId: string, scope: Scope) => Promise<ResultSet>;
  /** Must apply the school's audience rules and resolve the opaque cursor. */
  notices?: (userId: string, scope: Scope, cursor: string | null) => Promise<NoticeFeed>;
  /** Injected clock keeps scheduled notices out of the feed deterministically. */
  now?: () => Date;
};
export class ApiFailure extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code); this.status = status; this.code = code;
  }
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string): never => { throw new ApiFailure(status, code); };
const cursorPattern = /^[A-Za-z0-9_-]{1,128}$/;
function scopeFrom(url: URL, schoolId: string, allowed: readonly string[] = []): Scope {
  const role = url.searchParams.get('role');
  if (!uuid.test(schoolId) || (role !== 'professor' && role !== 'aluno')) fail(422, 'INVALID_SCOPE');
  const permitted = new Set(['role', ...allowed]);
  if ([...url.searchParams.keys()].some(k => !permitted.has(k)) ||
      [...permitted].some(k => url.searchParams.getAll(k).length > 1) ||
      url.searchParams.getAll('role').length !== 1) {
    fail(422, 'UNKNOWN_QUERY_FIELD');
  }
  return { schoolId, role: role as Role };
}
function cursorFrom(url: URL): string | null {
  const cursor = url.searchParams.get('cursor');
  if (cursor === null) return null;
  // An opaque cursor is never interpreted here; the service resolves it.
  if (!cursorPattern.test(cursor)) fail(422, 'INVALID_CURSOR');
  return cursor;
}
function response(data: unknown, status = 200, extra: Record<string,string> = {}) {
  return Response.json(data, {status, headers: {
    'Cache-Control': 'private, no-store', 'Vary': 'Authorization, Origin',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', ...extra,
  }});
}
function validateCatalog(catalog: Catalog, scope: Scope) {
  if (!catalog || catalog.schoolId !== scope.schoolId || catalog.role !== scope.role ||
      !Array.isArray(catalog.classes) || !Array.isArray(catalog.timetable) || !Array.isArray(catalog.tasks) ||
      [catalog.classes, catalog.timetable, catalog.tasks].some(list => list.length > 1000)) fail(503, 'CATALOG_INVALID');
  const ids = new Set<string>();
  for (const c of catalog.classes) {
    if (!c || !uuid.test(c.classGroupId) || !uuid.test(c.classSubjectId) ||
        !uuid.test(c.subjectId) || !uuid.test(c.academicYearId) ||
        (c.teacher != null && (typeof c.teacher !== 'object' || typeof c.teacher.name !== 'string')) ||
        typeof c.className !== 'string' || typeof c.subjectName !== 'string' || ids.has(c.classSubjectId)) {
      fail(503, 'CATALOG_INVALID');
    }
    ids.add(c.classSubjectId);
  }
  const taskIds = new Set<string>();
  for (const t of catalog.tasks) {
    if (!t || typeof t.id !== 'string' || !uuid.test(t.id) || taskIds.has(t.id) ||
        typeof t.title !== 'string' || typeof t.kind !== 'string' ||
        (t.instructions != null && typeof t.instructions !== 'string') ||
        (t.due != null && (typeof t.due !== 'string' || !Number.isFinite(Date.parse(t.due))))) fail(503, 'CATALOG_INVALID');
    taskIds.add(t.id as string);
  }
  if ([...catalog.timetable, ...catalog.tasks].some(x => !x || !ids.has(x.classSubjectId))) fail(503, 'CATALOG_INVALID');
}
/** A draft, another pupil's set or a grade outside the school's scale is a
 * service inconsistency: fail closed instead of showing partial marks. */
function validateResults(set: ResultSet, scope: Scope, userId: string, ids: Set<string>) {
  if (!set || set.schoolId !== scope.schoolId || set.role !== scope.role ||
      set.studentId !== userId || !Array.isArray(set.items) || set.items.length > 1000) fail(503, 'RESULTS_INVALID');
  const seen = new Set<string>();
  for (const item of set.items) {
    const scale = item?.scaleMax;
    if (!item || !ids.has(item.classSubjectId) || !uuid.test(item.termId) ||
        typeof item.termName !== 'string' || !item.termName.trim() ||
        item.publication !== 'published' || typeof scale !== 'number' ||
        !Number.isFinite(scale) || scale <= 0 || scale > 100 ||
        !Array.isArray(item.grades) || item.grades.length > 50 ||
        (item.status != null && typeof item.status !== 'string') ||
        seen.has(`${item.classSubjectId}:${item.termId}`)) fail(503, 'RESULTS_INVALID');
    seen.add(`${item.classSubjectId}:${item.termId}`);
    const codes = new Set<string>();
    for (const grade of [...item.grades, {code: 'final', label: 'final', value: item.finalGrade}]) {
      if (!grade || typeof grade.code !== 'string' || !grade.code ||
          typeof grade.label !== 'string' ||
          (grade.value != null && (typeof grade.value !== 'number' ||
            !Number.isFinite(grade.value) || grade.value < 0 || grade.value > scale))) fail(503, 'RESULTS_INVALID');
    }
    for (const grade of item.grades) {
      if (codes.has(grade.code)) fail(503, 'RESULTS_INVALID');
      codes.add(grade.code);
    }
  }
}
/** A notice for another class, or one scheduled for later, must never reach
 * this device even when the feed query is wrong. */
function validateNotices(feed: NoticeFeed, scope: Scope, ids: Set<string>, now: Date, cursor: string | null) {
  if (!feed || feed.schoolId !== scope.schoolId || feed.role !== scope.role ||
      !Array.isArray(feed.items) || feed.items.length > 100 ||
      !Number.isFinite(now.getTime()) ||
      (feed.nextCursor != null && (typeof feed.nextCursor !== 'string' ||
        !cursorPattern.test(feed.nextCursor) || feed.nextCursor === cursor))) fail(503, 'NOTICES_INVALID');
  const seen = new Set<string>();
  for (const notice of feed.items) {
    const published = Date.parse(notice?.publishedAt as string);
    if (!notice || !uuid.test(notice.id) || seen.has(notice.id) ||
        typeof notice.title !== 'string' || !notice.title.trim() ||
        typeof notice.body !== 'string' || notice.body.length > 20000 ||
        typeof notice.pinned !== 'boolean' ||
        typeof notice.publishedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(notice.publishedAt) ||
        !Number.isFinite(published) || published > now.getTime() + 60000 ||
        !['school', 'class', 'subject'].includes(notice.audience) ||
        (notice.audience === 'school'
          ? notice.classSubjectId != null
          : typeof notice.classSubjectId !== 'string' || !ids.has(notice.classSubjectId))) fail(503, 'NOTICES_INVALID');
    seen.add(notice.id);
  }
}
/** Explicit allowlist avoids accidentally exporting rosters, user IDs or future
 * sensitive fields when the canonical catalog grows. */
function subject(c: Subject) {
  return { classSubjectId: c.classSubjectId, subjectId: c.subjectId,
    subjectName: c.subjectName, teacherName: c.teacher?.name ?? null };
}
export async function handleInstitutionalExtension(request: Request, deps: Dependencies): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = /^\/api\/mobile-v4\/schools\/([^/]+)\/(classes|tasks|results|notices)(?:\/([^/]+))?$/.exec(url.pathname);
    if (!match) return response({error: 'NOT_FOUND'}, 404);
    if (request.method !== 'GET') return response({error: 'METHOD_NOT_ALLOWED'}, 405, {Allow: 'GET'});
    const origin = request.headers.get('Origin');
    if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') fail(403, 'ORIGIN_FORBIDDEN');
    const operation = match[2];
    const scope = scopeFrom(url, match[1], operation === 'notices' ? ['cursor'] : []);
    const cursor = operation === 'notices' ? cursorFrom(url) : null;
    const resourceId = match[3];
    if (resourceId && (operation === 'results' || operation === 'notices')) return response({error: 'NOT_FOUND'}, 404);
    const classGroupId = operation === 'classes' ? resourceId : undefined;
    if (resourceId && !uuid.test(resourceId)) fail(422, 'INVALID_CLASS');
    // Marks of a class are a per-profile privacy decision that is not made
    // here: the teacher profile has no results contract yet, so no catalog or
    // record lookup happens for it.
    if (operation === 'results' && scope.role !== 'aluno') fail(403, 'RESULTS_PROFILE_UNSUPPORTED');
    const bearer = request.headers.get('Authorization');
    if (!bearer?.startsWith('Bearer ') || !bearer.slice(7).trim()) fail(401, 'SESSION_REQUIRED');
    let identity: Identity;
    try { identity = await deps.authenticate(bearer!); }
    catch { return response({error: 'SESSION_REQUIRED'}, 401); }
    if (!identity?.userId) fail(401, 'SESSION_REQUIRED');
    const catalog = await deps.academicCatalog(identity.userId, scope);
    validateCatalog(catalog, scope);
    const authorized = new Set(catalog.classes.map(c => c.classSubjectId));
    const envelope = {version: 1, schoolId: scope.schoolId, role: scope.role};
    if (operation === 'results') {
      if (!deps.academicResults) fail(503, 'SERVICE_UNAVAILABLE');
      const set = await deps.academicResults(identity.userId, scope);
      validateResults(set, scope, identity.userId, authorized);
      const names = new Map(catalog.classes.map(c => [c.classSubjectId, c.subjectName]));
      return response({...envelope, items: set.items.map(item => ({
        classSubjectId: item.classSubjectId, subjectName: names.get(item.classSubjectId)!,
        termId: item.termId, termName: item.termName, publication: item.publication,
        scaleMax: item.scaleMax, finalGrade: item.finalGrade ?? null, status: item.status ?? null,
        grades: item.grades.map(g => ({code: g.code, label: g.label, value: g.value ?? null})),
      }))});
    }
    if (operation === 'notices') {
      if (!deps.notices) fail(503, 'SERVICE_UNAVAILABLE');
      const now = deps.now ? deps.now() : new Date();
      const feed = await deps.notices(identity.userId, scope, cursor);
      validateNotices(feed, scope, authorized, now, cursor);
      const names = new Map(catalog.classes.map(c => [c.classSubjectId, c.subjectName]));
      return response({...envelope, nextCursor: feed.nextCursor ?? null, items: feed.items.map(n => ({
        id: n.id, title: n.title, body: n.body, publishedAt: n.publishedAt,
        audience: n.audience, pinned: n.pinned, classSubjectId: n.classSubjectId ?? null,
        subjectName: n.classSubjectId ? names.get(n.classSubjectId)! : null,
      }))});
    }
    if (operation === 'tasks') {
      const items = catalog.tasks.map(t => ({id: t.id, classSubjectId: t.classSubjectId,
        kind: t.kind, title: t.title, instructions: t.instructions, due: t.due}));
      if (!resourceId) return response({...envelope, items});
      const item = items.find(t => t.id === resourceId);
      if (!item) fail(404, 'TASK_NOT_AVAILABLE');
      return response({...envelope, item});
    }
    const groups = new Map<string, Subject[]>();
    for (const c of catalog.classes) {
      const list = groups.get(c.classGroupId) ?? [];
      if (list.some(x => x.className !== c.className || x.academicYearId !== c.academicYearId)) fail(503, 'CATALOG_INVALID');
      list.push(c); groups.set(c.classGroupId, list);
    }
    if (!classGroupId) return response({...envelope, items: [...groups].map(([id, list]) => ({
      id, name: list[0].className, academicYearId: list[0].academicYearId,
      subjects: list.map(subject),
    }))});
    const list = groups.get(classGroupId);
    // Same response for absent and unauthorized classes; no existence lookup.
    if (!list) fail(404, 'CLASS_NOT_AVAILABLE');
    const ids = new Set(list!.map(c => c.classSubjectId));
    return response({...envelope, item: {
      id: classGroupId, name: list![0].className, academicYearId: list![0].academicYearId,
      subjects: list!.map(subject),
      timetable: catalog.timetable.filter(s => ids.has(s.classSubjectId)).map(s => ({
        slotId: s.slotId, classSubjectId: s.classSubjectId, weekday: s.weekday,
        startsAt: s.startsAt, endsAt: s.endsAt, room: s.room,
        publication: s.publication, validFrom: s.validFrom, validTo: s.validTo,
      })),
      tasks: catalog.tasks.filter(t => ids.has(t.classSubjectId)).map(t => ({
        id: t.id, classSubjectId: t.classSubjectId, kind: t.kind, title: t.title,
        instructions: t.instructions, due: t.due,
      })),
    }});
  } catch (error) {
    if (error instanceof ApiFailure) return response({error: error.code}, error.status);
    return response({error: 'SERVICE_UNAVAILABLE'}, 503);
  }
}
