import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";

const ZOOM_AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";
const ZOOM_API_URL = "https://api.zoom.us/v2";
const ZOOM_PROVIDER = "zoom";

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configuração Zoom em falta: ${name}.`);
  return value;
}

function basicAuth() {
  return `Basic ${Buffer.from(`${env("ZOOM_CLIENT_ID")}:${env("ZOOM_CLIENT_SECRET")}`).toString("base64")}`;
}

function redirectUri() {
  return (
    process.env.ZOOM_REDIRECT_URI?.trim() || "https://app.portal-siga.com/api/integrations/zoom/callback"
  );
}

function randomState() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

async function saveSecret(schoolId: string, key: string, value: string, expiresAt?: string | null) {
  const db = await loadSgaAdminClient();
  const { error } = await db.from("school_integration_secrets").upsert(
    {
      school_id: schoolId,
      provider: ZOOM_PROVIDER,
      secret_key: key,
      secret_value: value,
      expires_at: expiresAt ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "school_id,provider,secret_key" },
  );
  if (error) throw error;
}

async function readSecret(schoolId: string, key: string) {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("school_integration_secrets")
    .select("secret_value, expires_at")
    .eq("school_id", schoolId)
    .eq("provider", ZOOM_PROVIDER)
    .eq("secret_key", key)
    .maybeSingle();
  if (error) throw error;
  return data as { secret_value: string; expires_at: string | null } | null;
}

async function deleteSecrets(schoolId: string) {
  const db = await loadSgaAdminClient();
  await db
    .from("school_integration_secrets")
    .delete()
    .eq("school_id", schoolId)
    .eq("provider", ZOOM_PROVIDER);
}

async function getAccessToken(schoolId: string) {
  const access = await readSecret(schoolId, "access_token");
  if (
    access &&
    (!access.expires_at || new Date(access.expires_at).getTime() > Date.now() + 60_000)
  ) {
    return access.secret_value;
  }

  const refresh = await readSecret(schoolId, "refresh_token");
  if (!refresh) throw new Error("Zoom não está ligado a esta escola.");

  const response = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh.secret_value }),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error("Não foi possível renovar a autorização Zoom.");
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  await saveSecret(
    schoolId,
    "access_token",
    payload.access_token,
    new Date(Date.now() + expiresIn * 1000).toISOString(),
  );
  if (typeof payload.refresh_token === "string") {
    await saveSecret(schoolId, "refresh_token", payload.refresh_token);
  }
  return payload.access_token;
}

async function zoomRequest(schoolId: string, path: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken(schoolId);
  const response = await fetch(`${ZOOM_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom API ${response.status}: ${text.slice(0, 500)}`);
  }
  return response;
}

const createMeetingSchema = z.object({
  attendanceSessionId: z.string().uuid(),
  topic: z.string().trim().min(1).max(200).optional(),
  startTime: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().max(1440).optional(),
});

export const startZoomOAuth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const clientId = env("ZOOM_CLIENT_ID");
    const uri = redirectUri();
    if (!uri) throw new Error("Configuração Zoom em falta: ZOOM_REDIRECT_URI.");
    const state = randomState();
    await saveSecret(
      membership.schoolId,
      `oauth_state:${state}`,
      JSON.stringify({ userId: context.userId, createdAt: Date.now() }),
      new Date(Date.now() + 10 * 60_000).toISOString(),
    );
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: uri,
      state,
    });
    return { authorizeUrl: `${ZOOM_AUTHORIZE_URL}?${params.toString()}` };
  });

export const completeZoomOAuth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem escola activa.");
    const stateRow = await readSecret(membership.schoolId, `oauth_state:${data.state}`);
    if (
      !stateRow ||
      (stateRow.expires_at && new Date(stateRow.expires_at).getTime() <= Date.now())
    ) {
      throw new Error("Estado OAuth Zoom inválido ou expirado.");
    }
    const state = JSON.parse(stateRow.secret_value) as { userId?: string };
    if (state.userId !== context.userId)
      throw new Error("Estado OAuth Zoom não pertence ao utilizador actual.");

    const response = await fetch(ZOOM_TOKEN_URL, {
      method: "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: data.code,
        redirect_uri: redirectUri(),
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (
      !response.ok ||
      typeof payload.access_token !== "string" ||
      typeof payload.refresh_token !== "string"
    ) {
      throw new Error("Não foi possível concluir a autorização Zoom.");
    }
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
    await saveSecret(
      membership.schoolId,
      "access_token",
      payload.access_token,
      new Date(Date.now() + expiresIn * 1000).toISOString(),
    );
    await saveSecret(membership.schoolId, "refresh_token", payload.refresh_token);
    await saveSecret(
      membership.schoolId,
      "scope",
      typeof payload.scope === "string" ? payload.scope : "",
    );
    await loadSgaAdminClient();
    const db = await loadSgaAdminClient();
    const meResponse = await zoomRequest(membership.schoolId, "/users/me");
    const me = (await meResponse.json()) as {
      id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
    };
    const existing = await db
      .from("school_integrations")
      .select("config")
      .eq("school_id", membership.schoolId)
      .eq("provider", "zoom")
      .maybeSingle();
    const current =
      existing.data?.config &&
      typeof existing.data.config === "object" &&
      !Array.isArray(existing.data.config)
        ? existing.data.config
        : {};
    const { error } = await db.from("school_integrations").upsert(
      {
        school_id: membership.schoolId,
        provider: "zoom",
        status: "connected",
        config: {
          ...current,
          accountId: me.id ?? "",
          accountEmail: me.email ?? "",
          accountName: [me.first_name, me.last_name].filter(Boolean).join(" "),
          connectedAt: new Date().toISOString(),
        },
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "school_id,provider" },
    );
    if (error) throw error;
    await db
      .from("school_integration_secrets")
      .delete()
      .eq("school_id", membership.schoolId)
      .eq("provider", "zoom")
      .like("secret_key", "oauth_state:%");
    return { ok: true };
  });

export const disconnectZoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    await deleteSecrets(membership.schoolId);
    const { data: existing } = await db
      .from("school_integrations")
      .select("config")
      .eq("school_id", membership.schoolId)
      .eq("provider", "zoom")
      .maybeSingle();
    const current =
      existing?.config && typeof existing.config === "object" && !Array.isArray(existing.config)
        ? existing.config
        : {};
    const { error } = await db.from("school_integrations").upsert(
      {
        school_id: membership.schoolId,
        provider: "zoom",
        status: "disconnected",
        config: {
          ...current,
          accountId: "",
          accountEmail: "",
          accountName: "",
          connectedAt: null,
          grantedCapabilities: [],
        },
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "school_id,provider" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const createZoomLessonMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createMeetingSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();
    const { data: session, error: sessionError } = await db
      .from("siga_attendance_sessions")
      .select("id, school_id, subject_id, teacher_id, lesson_date, starts_at, ends_at")
      .eq("id", data.attendanceSessionId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (sessionError || !session) throw new Error("Aula/sessão não encontrada na escola actual.");

    if (membership.appRole === "Professor") {
      const { data: teacher } = await db
        .from("teachers")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!teacher || session.teacher_id !== teacher.id)
        throw new Error("O professor só pode criar reuniões para as suas próprias aulas.");
    }

    const { data: existing } = await db
      .from("siga_lesson_meetings")
      .select("id, join_url, external_meeting_id, status")
      .eq("attendance_session_id", session.id)
      .eq("provider", "zoom")
      .maybeSingle();
    if (existing?.status === "active") return existing;

    const startTime =
      data.startTime ??
      (session.lesson_date && session.starts_at
        ? `${session.lesson_date}T${session.starts_at}:00`
        : undefined);
    const topic = data.topic ?? "Aula";
    const response = await zoomRequest(membership.schoolId, "/users/me/meetings", {
      method: "POST",
      body: JSON.stringify({
        topic,
        type: 2,
        start_time: startTime,
        duration: data.durationMinutes ?? 60,
        timezone: "Africa/Luanda",
        settings: { waiting_room: true, join_before_host: false, mute_upon_entry: true },
      }),
    });
    const meeting = (await response.json()) as {
      id?: number;
      join_url?: string;
      start_time?: string;
      duration?: number;
      topic?: string;
    };
    if (!meeting.id || !meeting.join_url)
      throw new Error("O Zoom não devolveu os dados da reunião.");
    const { data: row, error } = await db
      .from("siga_lesson_meetings")
      .upsert(
        {
          school_id: membership.schoolId,
          attendance_session_id: session.id,
          provider: "zoom",
          external_meeting_id: String(meeting.id),
          join_url: meeting.join_url,
          topic: meeting.topic ?? topic,
          starts_at: meeting.start_time ?? startTime ?? null,
          duration_minutes: meeting.duration ?? data.durationMinutes ?? 60,
          status: "active",
          created_by: context.userId,
          updated_by: context.userId,
        },
        { onConflict: "attendance_session_id,provider" },
      )
      .select(
        "id, attendance_session_id, provider, external_meeting_id, join_url, topic, starts_at, duration_minutes, status",
      )
      .single();
    if (error) throw error;
    return row;
  });

export const getZoomLessonMeeting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ attendanceSessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return null;
    const db = await loadSgaAdminClient();
    const { data: row } = await db
      .from("siga_lesson_meetings")
      .select(
        "id, attendance_session_id, provider, external_meeting_id, join_url, topic, starts_at, duration_minutes, status",
      )
      .eq("school_id", membership.schoolId)
      .eq("attendance_session_id", data.attendanceSessionId)
      .eq("provider", "zoom")
      .maybeSingle();
    return row ?? null;
  });
