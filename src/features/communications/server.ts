import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  archiveAnnouncementInputSchema,
  createAnnouncementInputSchema,
  listAnnouncementsInputSchema,
  updateAnnouncementInputSchema,
  updateAnnouncementStatusInputSchema,
} from "./schemas";

function mapStatusToUi(status: string | null | undefined) {
  if (status === "published") return "sent";
  if (status === "draft") return "draft";
  if (status === "archived") return "cancelled";
  return status ?? "draft";
}

function mapStatusToSga(status: string) {
  if (status === "sent") return "published";
  if (status === "scheduled") return "draft";
  if (status === "cancelled") return "archived";
  return status;
}

export const listSchoolAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAnnouncementsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    let query = db
      .from("announcements")
      .select(
        "id, title, body, audience, status, published_at, created_at, updated_at, priority, role_code",
      )
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status) {
      query = query.eq("status", mapStatusToSga(data.status));
    }

    const { data: announcements, error } = await query;
    if (error) {
      throw publicDatabaseError(error, "Não foi possível carregar os comunicados.");
    }
    return (announcements ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      audience: row.audience ?? "school",
      channel: "app",
      status: mapStatusToUi(String(row.status)),
      scheduled_for: null,
      published_at: row.published_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  });

export const createSchoolAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createAnnouncementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const sgaStatus = mapStatusToSga(data.status);
    const publishedAt = sgaStatus === "published" ? new Date().toISOString() : null;
    const { data: announcement, error } = await db
      .from("announcements")
      .insert({
        school_id: membership.schoolId,
        title: data.title,
        body: data.body,
        audience: data.audience,
        priority: "normal",
        status: sgaStatus,
        published_at: publishedAt,
        created_by: context.userId,
      })
      .select("id, title, body, audience, status, published_at, created_at, updated_at")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o comunicado.");
    return {
      ...announcement,
      channel: data.channel,
      status: mapStatusToUi(announcement.status),
      scheduled_for: data.scheduledFor ?? null,
    };
  });

export const updateSchoolAnnouncementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAnnouncementStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireSgaWriter(context.supabase, context.userId, ["Administrador", "Secretaria"]);
    const db = await loadSgaAdminClient();
    const sgaStatus = mapStatusToSga(data.status);
    const patch = {
      status: sgaStatus,
      published_at: sgaStatus === "published" ? new Date().toISOString() : null,
      archived_at: sgaStatus === "archived" ? new Date().toISOString() : null,
    };

    const { data: announcement, error } = await db
      .from("announcements")
      .update(patch)
      .eq("id", data.id)
      .select("id, title, body, audience, status, published_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o comunicado.");
    if (!announcement) throw new Error("Comunicado não encontrado.");
    return {
      ...announcement,
      channel: "app",
      status: mapStatusToUi(announcement.status),
      scheduled_for: data.scheduledFor ?? null,
    };
  });

export const updateSchoolAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAnnouncementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: announcement, error } = await db
      .from("announcements")
      .update({
        title: data.title,
        body: data.body,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id, title, body, audience, status, published_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o comunicado.");
    if (!announcement) throw new Error("Comunicado não encontrado.");
    return {
      ...announcement,
      channel: "app",
      status: mapStatusToUi(announcement.status),
      scheduled_for: null,
    };
  });

export const archiveSchoolAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => archiveAnnouncementInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: announcement, error } = await db
      .from("announcements")
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id, title, body, audience, status, published_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível arquivar o comunicado.");
    if (!announcement) throw new Error("Comunicado não encontrado.");
    return {
      ...announcement,
      channel: "app",
      status: mapStatusToUi(announcement.status),
      scheduled_for: null,
    };
  });
