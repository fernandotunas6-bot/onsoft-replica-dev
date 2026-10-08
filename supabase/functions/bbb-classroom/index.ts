// Authenticated Supabase Edge Function. Never accept a role or school from client JSON.
// Requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
// This endpoint does not call BBB or expose BBB credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const allowedOrigins = new Set(["https://portal-siga.com", "https://www.portal-siga.com"]);
const cors = (request: Request) => {
  const origin = request.headers.get("Origin");
  return origin && allowedOrigins.has(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : {};
};
const respond = (status: number, body: unknown, request: Request) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, ...cors(request) } });
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing server configuration: " + name);
  return value;
};
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors(request) });
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin))
    return respond(403, { error: "Origin not allowed" }, request);
  if (request.method !== "POST") return respond(405, { error: "Method not allowed" }, request);
  const token = /^Bearer (.+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return respond(401, { error: "Authentication required" }, request);
  try {
    const url = env("SUPABASE_URL");
    const auth = createClient(url, env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false },
    });
    const { data: userResult, error: userError } = await auth.auth.getUser(token);
    if (userError || !userResult.user) return respond(401, { error: "Invalid session" }, request);
    const body = await request.json().catch(() => null);
    if (body?.action === "list") {
      if (!isUuid(body.schoolId)) return respond(400, { error: "Invalid school" }, request);
      const db = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
      });
      const userId = userResult.user.id;
      const { data: membership, error: membershipError } = await db
        .from("school_memberships")
        .select("id")
        .eq("school_id", body.schoolId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return respond(403, { error: "Access denied" }, request);
      const { data: memberRoles, error: memberRolesError } = await db
        .from("member_roles")
        .select("role_id")
        .eq("school_id", body.schoolId)
        .eq("membership_id", membership.id);
      if (memberRolesError) throw memberRolesError;
      const roleIds = (memberRoles ?? []).map((r) => r.role_id);
      const { data: roles, error: rolesError } = await db
        .from("roles")
        .select("code")
        .eq("school_id", body.schoolId)
        .in("id", roleIds.length ? roleIds : ["00000000-0000-0000-0000-000000000000"]);
      if (rolesError) throw rolesError;
      const codes = new Set((roles ?? []).map((r) => r.code.toLowerCase()));
      const admin = codes.has("owner") || codes.has("admin");
      const { data: teachers, error: teacherError } = await db
        .from("teachers")
        .select("id")
        .eq("school_id", body.schoolId)
        .eq("user_id", userId)
        .eq("status", "active");
      if (teacherError) throw teacherError;
      const teacherIds = (teachers ?? []).map((teacher) => teacher.id);
      const { data: assignments, error: assignmentError } = teacherIds.length
        ? await db
            .from("class_subjects")
            .select("class_group_id")
            .eq("school_id", body.schoolId)
            .eq("status", "active")
            .in("teacher_id", teacherIds)
        : { data: [], error: null };
      if (assignmentError) throw assignmentError;
      const { data: people, error: peopleError } = await db
        .from("people")
        .select("id")
        .eq("school_id", body.schoolId)
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (peopleError) throw peopleError;
      const personIds = (people ?? []).map((person) => person.id);
      const { data: students, error: studentError } = personIds.length
        ? await db
            .from("students")
            .select("id")
            .eq("school_id", body.schoolId)
            .is("deleted_at", null)
            .in("person_id", personIds)
        : { data: [], error: null };
      if (studentError) throw studentError;
      const studentIds = (students ?? []).map((student) => student.id);
      const { data: enrollments, error: enrollmentError } = studentIds.length
        ? await db
            .from("enrollments")
            .select("class_group_id")
            .eq("school_id", body.schoolId)
            .eq("status", "active")
            .is("ended_on", null)
            .in("student_id", studentIds)
        : { data: [], error: null };
      if (enrollmentError) throw enrollmentError;
      const visibleGroups = new Set<string>();
      if (codes.has("teacher"))
        for (const a of assignments ?? []) visibleGroups.add(a.class_group_id);
      if (codes.has("student"))
        for (const e of enrollments ?? []) visibleGroups.add(e.class_group_id);
      if (!admin && !visibleGroups.size) return respond(200, { sessions: [] }, request);
      let query = db
        .from("bbb_classroom_sessions")
        .select("id,title,class_group_id,starts_at,ends_at,status")
        .eq("school_id", body.schoolId)
        .order("starts_at", { ascending: false })
        .limit(100);
      if (!admin) query = query.in("class_group_id", [...visibleGroups]);
      const { data: sessions, error: sessionsError } = await query;
      if (sessionsError) throw sessionsError;
      return respond(200, { sessions: sessions ?? [] }, request);
    }
    if (body?.action === "schedule") {
      if (!isUuid(body.schoolId) || !isUuid(body.classGroupId) || !isUuid(body.teacherId))
        return respond(400, { error: "Invalid school, class or teacher" }, request);
      if (
        typeof body.title !== "string" ||
        body.title.trim().length < 1 ||
        body.title.trim().length > 200
      )
        return respond(400, { error: "Invalid title" }, request);
      const startsAt = typeof body.startsAt === "string" ? Date.parse(body.startsAt) : NaN;
      const endsAt = typeof body.endsAt === "string" ? Date.parse(body.endsAt) : NaN;
      if (
        !Number.isFinite(startsAt) ||
        !Number.isFinite(endsAt) ||
        startsAt < Date.now() - 60000 ||
        endsAt <= startsAt ||
        endsAt - startsAt > 8 * 3600000
      )
        return respond(400, { error: "Invalid classroom schedule" }, request);
      const db = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
      });
      const userId = userResult.user.id;
      const [
        { data: membership, error: membershipError },
        { data: classGroup, error: classError },
        { data: teacher, error: teacherError },
      ] = await Promise.all([
        db
          .from("school_memberships")
          .select("id")
          .eq("school_id", body.schoolId)
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle(),
        db
          .from("class_groups")
          .select("id")
          .eq("school_id", body.schoolId)
          .eq("id", body.classGroupId)
          .maybeSingle(),
        db
          .from("teachers")
          .select("id,user_id")
          .eq("school_id", body.schoolId)
          .eq("id", body.teacherId)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      if (membershipError || classError || teacherError)
        throw membershipError ?? classError ?? teacherError;
      if (!membership || !classGroup || !teacher)
        return respond(403, { error: "Access denied" }, request);
      const { data: memberRoles, error: memberRolesError } = await db
        .from("member_roles")
        .select("role_id")
        .eq("school_id", body.schoolId)
        .eq("membership_id", membership.id);
      if (memberRolesError) throw memberRolesError;
      const roleIds = (memberRoles ?? []).map((r) => r.role_id);
      const { data: roles, error: rolesError } = await db
        .from("roles")
        .select("code")
        .eq("school_id", body.schoolId)
        .in("id", roleIds.length ? roleIds : ["00000000-0000-0000-0000-000000000000"]);
      if (rolesError) throw rolesError;
      const codes = new Set((roles ?? []).map((r) => r.code.toLowerCase()));
      const admin = codes.has("owner") || codes.has("admin");
      const { data: assignments, error: assignmentError } = await db
        .from("class_subjects")
        .select("id")
        .eq("school_id", body.schoolId)
        .eq("class_group_id", body.classGroupId)
        .eq("teacher_id", body.teacherId)
        .eq("status", "active")
        .limit(1);
      if (assignmentError) throw assignmentError;
      if (!assignments?.length || (!admin && !(codes.has("teacher") && teacher.user_id === userId)))
        return respond(403, { error: "Access denied" }, request);
      const sessionId = crypto.randomUUID();
      // No BBB credentials are needed for scheduling. Meetings are provisioned later.
      const meetingId = [body.schoolId, body.classGroupId, sessionId]
        .map((value: string) => value.length + "-" + value)
        .join("_");
      const { data: created, error: createError } = await db
        .from("bbb_classroom_sessions")
        .insert({
          id: sessionId,
          school_id: body.schoolId,
          class_group_id: body.classGroupId,
          teacher_id: body.teacherId,
          title: body.title.trim(),
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          meeting_id: meetingId,
          status: "scheduled",
        })
        .select("id,title,class_group_id,status,starts_at,ends_at")
        .single();
      if (createError) throw createError;
      return respond(201, { session: created }, request);
    }
    if (!body || !isUuid(body.sessionId))
      return respond(400, { error: "Invalid session ID" }, request);
    if (body.action !== "capabilities")
      return respond(501, { error: "Operation not enabled" }, request);

    // Privileged access is isolated inside this function. The token was
    // verified above; every query below is scoped by server-fetched school.
    const db = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data: session, error: sessionError } = await db
      .from("bbb_classroom_sessions")
      .select("id,school_id,class_group_id,teacher_id,status,recordings_published")
      .eq("id", body.sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return respond(404, { error: "Session not found" }, request);
    const userId = userResult.user.id;
    const { data: membership, error: membershipError } = await db
      .from("school_memberships")
      .select("id,status")
      .eq("school_id", session.school_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return respond(403, { error: "Access denied" }, request);

    const [
      { data: memberRoles, error: roleError },
      { data: teacher, error: teacherError },
      { data: person, error: personError },
    ] = await Promise.all([
      db
        .from("member_roles")
        .select("role_id")
        .eq("membership_id", membership.id)
        .eq("school_id", session.school_id),
      db
        .from("teachers")
        .select("id")
        .eq("id", session.teacher_id)
        .eq("school_id", session.school_id)
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("people")
        .select("id")
        .eq("school_id", session.school_id)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    if (roleError || teacherError || personError) throw roleError ?? teacherError ?? personError;
    const { data: student, error: studentError } = person
      ? await db
          .from("students")
          .select("id")
          .eq("school_id", session.school_id)
          .eq("person_id", person.id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null, error: null };
    if (studentError) throw studentError;
    const roleIds = (memberRoles ?? []).map((r) => r.role_id);
    const { data: roles, error: rolesError } = await db
      .from("roles")
      .select("code")
      .eq("school_id", session.school_id)
      .in("id", roleIds.length ? roleIds : ["00000000-0000-0000-0000-000000000000"]);
    if (rolesError) throw rolesError;
    const codes = new Set((roles ?? []).map((r) => r.code.toLowerCase()));
    const admin = ["owner", "admin"].some((code) => codes.has(code));
    const { data: assignment, error: assignmentError } = teacher
      ? await db
          .from("class_subjects")
          .select("id")
          .eq("school_id", session.school_id)
          .eq("class_group_id", session.class_group_id)
          .eq("teacher_id", teacher.id)
          .eq("status", "active")
          .limit(1)
      : { data: null, error: null };
    if (assignmentError) throw assignmentError;
    const { data: enrollment, error: enrollmentError } = student
      ? await db
          .from("enrollments")
          .select("id")
          .eq("school_id", session.school_id)
          .eq("class_group_id", session.class_group_id)
          .eq("student_id", student.id)
          .eq("status", "active")
          .is("ended_on", null)
          .limit(1)
      : { data: null, error: null };
    if (enrollmentError) throw enrollmentError;
    const teacherAllowed = Boolean(teacher && assignment?.length && codes.has("teacher"));
    const studentAllowed = Boolean(student && enrollment?.length && codes.has("student"));
    if (!admin && !teacherAllowed && !studentAllowed)
      return respond(403, { error: "Access denied" }, request);
    // Only advertise actions implemented by this deployed function.
    // BBB meeting creation, joining, ending and recordings are not enabled yet.
    const host = admin || teacherAllowed;
    return respond(
      200,
      {
        sessionId: session.id,
        status: session.status,
        capabilities: {
          create: false,
          start: false,
          join: false,
          end: false,
          recordings: false,
          schedule: host,
        },
      },
      request,
    );
  } catch {
    // Do not leak database details or configuration values to callers.
    return respond(500, { error: "Classroom service unavailable" }, request);
  }
});
