// Authenticated Supabase Edge Function. Never accept a role or school from client JSON.
// Deploy only after configuring SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY, BBB_API_URL and BBB_API_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing server configuration: " + name);
  return value;
};
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond(405, { error: "Method not allowed" });
  const token = /^Bearer (.+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return respond(401, { error: "Authentication required" });
  try {
    const url = env("SUPABASE_URL");
    const auth = createClient(url, env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false },
    });
    const { data: userResult, error: userError } = await auth.auth.getUser(token);
    if (userError || !userResult.user) return respond(401, { error: "Invalid session" });
    const body = await request.json().catch(() => null);
    if (!body || !isUuid(body.sessionId)) return respond(400, { error: "Invalid session ID" });
    if (body.action !== "capabilities") return respond(501, { error: "Operation not enabled" });

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
    if (!session) return respond(404, { error: "Session not found" });
    const userId = userResult.user.id;
    const { data: membership, error: membershipError } = await db
      .from("school_memberships")
      .select("id,status")
      .eq("school_id", session.school_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return respond(403, { error: "Access denied" });

    const [{ data: memberRoles, error: roleError }, { data: teacher, error: teacherError }, { data: student, error: studentError }] =
      await Promise.all([
        db.from("member_roles").select("role_id").eq("membership_id", membership.id).eq("school_id", session.school_id),
        db.from("teachers").select("id").eq("id", session.teacher_id).eq("school_id", session.school_id).eq("user_id", userId).maybeSingle(),
        db.from("students").select("id,people!inner(user_id)").eq("school_id", session.school_id).eq("people.user_id", userId).is("deleted_at", null).maybeSingle(),
      ]);
    if (roleError || teacherError || studentError) throw roleError ?? teacherError ?? studentError;
    const roleIds = (memberRoles ?? []).map((r) => r.role_id);
    const { data: roles, error: rolesError } = await db
      .from("roles").select("code").eq("school_id", session.school_id).in("id", roleIds.length ? roleIds : ["00000000-0000-0000-0000-000000000000"]);
    if (rolesError) throw rolesError;
    const codes = new Set((roles ?? []).map((r) => r.code.toLowerCase()));
    const admin = ["owner", "admin"].some((code) => codes.has(code));
    const { data: assignment, error: assignmentError } = teacher
      ? await db.from("class_subjects").select("id").eq("school_id", session.school_id)
          .eq("class_group_id", session.class_group_id).eq("teacher_id", teacher.id)
          .eq("status", "active").limit(1)
      : { data: null, error: null };
    if (assignmentError) throw assignmentError;
    const { data: enrollment, error: enrollmentError } = student
      ? await db.from("enrollments").select("id").eq("school_id", session.school_id)
          .eq("class_group_id", session.class_group_id).eq("student_id", student.id)
          .eq("status", "active").is("ended_on", null).limit(1)
      : { data: null, error: null };
    if (enrollmentError) throw enrollmentError;
    const teacherAllowed = Boolean(teacher && assignment?.length && codes.has("teacher"));
    const studentAllowed = Boolean(student && enrollment?.length && codes.has("student"));
    if (!admin && !teacherAllowed && !studentAllowed)
      return respond(403, { error: "Access denied" });
    const host = admin || teacherAllowed;
    return respond(200, {
      sessionId: session.id,
      status: session.status,
      capabilities: {
        create: session.status === "scheduled" && host,
        start: session.status === "scheduled" && host,
        join: session.status === "live" && (host || studentAllowed),
        end: session.status === "live" && host,
        recordings: session.status === "ended" &&
          (host || (studentAllowed && session.recordings_published === true)),
      },
    });
  } catch {
    // Do not leak database details or configuration values to callers.
    return respond(500, { error: "Classroom service unavailable" });
  }
});
