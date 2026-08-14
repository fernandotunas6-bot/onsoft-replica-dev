import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";

function randomToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export const getOrCreateCalendarFeedToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const existing = await db
      .from("calendar_feed_tokens")
      .select("token")
      .eq("school_id", membership.schoolId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing.data?.token) return { token: existing.data.token as string };
    const token = randomToken();
    const { error } = await db.from("calendar_feed_tokens").insert({
      school_id: membership.schoolId,
      user_id: context.userId,
      token,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível criar o feed do calendário.");
    return { token };
  });

export const revokeCalendarFeedToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const { error } = await db
      .from("calendar_feed_tokens")
      .delete()
      .eq("school_id", membership.schoolId)
      .eq("user_id", context.userId);
    if (error) throw publicDatabaseError(error, "Não foi possível revogar o feed.");
    return { ok: true };
  });

export const getPublicCalendarFeedInputSchema = z.object({
  token: z.string().trim().min(16).max(80),
});

export const getPublicCalendarFeed = createServerFn({ method: "GET" })
  .validator((input: unknown) => getPublicCalendarFeedInputSchema.parse(input))
  .handler(async ({ data }) => {
    const db = await loadSgaAdminClient();
    const { data: feed, error } = await db
      .from("calendar_feed_tokens")
      .select("school_id")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !feed) throw new Error("Feed de calendário inválido.");
    const { data: terms } = await db
      .from("terms")
      .select("name, starts_on, ends_on, sequence")
      .eq("school_id", feed.school_id)
      .order("starts_on")
      .limit(80);
    return (terms ?? []).map((term) => ({
      title: String(term.name ?? "Período lectivo"),
      description: `Período lectivo ${term.sequence ?? ""}`.trim(),
      event_date: String(term.starts_on ?? ""),
      ends_on: term.ends_on ? String(term.ends_on) : null,
    }));
  });
