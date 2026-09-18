import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import { angolaHolidaysBetween } from "./angola-holidays";
import type { CalendarIcsEvent } from "./ics";

export type PublicCalendarFeed = {
  calendarName: string;
  events: CalendarIcsEvent[];
};

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

export const getPublicCalendarFeedInputSchema = z.object({
  token: z.string().trim().min(16).max(80),
});

export async function loadPublicCalendarFeed(token: string): Promise<PublicCalendarFeed> {
  const db = await loadSgaAdminClient();
  const { data: feed, error } = await db
    .from("calendar_feed_tokens")
    .select("school_id")
    .eq("token", token)
    .maybeSingle();
  if (error || !feed) throw new Error("Feed de calendário inválido.");
  const [{ data: school }, { data: terms }] = await Promise.all([
    db.from("schools").select("name").eq("id", feed.school_id).maybeSingle(),
    db
      .from("terms")
      .select("id, name, starts_on, ends_on, sequence")
      .eq("school_id", feed.school_id)
      .order("starts_on")
      .limit(80),
  ]);
  const termEvents = (terms ?? []).map((term) => ({
    uid: `term-${String(term.id ?? "")}@siga.plus`,
    title: String(term.name ?? "Período lectivo"),
    description: `Período lectivo ${term.sequence ?? ""}`.trim(),
    event_date: String(term.starts_on ?? ""),
    ends_on: term.ends_on ? String(term.ends_on) : null,
  }));
  const dates = termEvents.flatMap((event) => [
    event.event_date,
    event.ends_on ?? event.event_date,
  ]);
  const from = dates.reduce((min, day) => (day < min ? day : min), dates[0] ?? "");
  const to = dates.reduce((max, day) => (day > max ? day : max), dates[0] ?? "");
  const holidays =
    from && to
      ? angolaHolidaysBetween(from, to).map((holiday) => ({
          uid: `holiday-${holiday.date}@siga.plus`,
          title: holiday.name,
          description: "Feriado nacional · Angola",
          event_date: holiday.date,
          ends_on: holiday.date,
        }))
      : [];
  const schoolName = String(school?.name ?? "").trim();
  return {
    calendarName: schoolName ? `${schoolName} · Calendário lectivo` : "Calendário lectivo SIGA",
    events: [...termEvents, ...holidays],
  };
}

export const getPublicCalendarFeed = createServerFn({ method: "GET" })
  .validator((input: unknown) => getPublicCalendarFeedInputSchema.parse(input))
  .handler(async ({ data }) => loadPublicCalendarFeed(data.token));
