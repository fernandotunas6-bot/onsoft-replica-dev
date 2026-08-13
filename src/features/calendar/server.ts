import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  createCalendarEventInputSchema,
  deleteCalendarEventInputSchema,
  listCalendarEventsInputSchema,
  updateCalendarEventInputSchema,
} from "./schemas";

export type CalendarEventSummary = {
  id: string;
  title: string;
  description: string;
  event_date: string;
  ends_on: string;
  category: "academic";
};

export const listCalendarEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listCalendarEventsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();

    const fromDate = data.fromDate ?? new Date().toISOString().slice(0, 10);
    const { data: terms, error } = await db
      .from("terms")
      .select("id, name, starts_on, ends_on, sequence, academic_year_id")
      .eq("school_id", membership.schoolId)
      .gte("ends_on", fromDate)
      .order("starts_on", { ascending: true })
      .limit(data.limit);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar o calendário lectivo.");

    return (terms ?? []).map((term: Record<string, unknown>) => ({
      id: String(term["id"] ?? ""),
      title: String(term["name"] ?? ""),
      description: `Período lectivo ${term["sequence"] ?? ""}`.trim(),
      event_date: String(term["starts_on"] ?? ""),
      ends_on: String(term["ends_on"] ?? ""),
      category: "academic" as const,
    }));
  });

export const createCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createCalendarEventInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    if (data.endsOn < data.eventDate) {
      throw new Error("A data de fim não pode ser anterior ao início.");
    }
    const db = await loadSgaAdminClient();

    let academicYearId = data.academicYearId;
    if (!academicYearId) {
      const { data: year, error: yearError } = await db
        .from("academic_years")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (yearError)
        throw publicDatabaseError(yearError, "Não foi possível resolver o ano lectivo.");
      academicYearId = year?.id;
    }
    if (!academicYearId) throw new Error("Não há um ano lectivo activo para criar o período.");

    let sequence = data.sequence;
    if (!sequence) {
      const { data: existing } = await db
        .from("terms")
        .select("sequence")
        .eq("school_id", membership.schoolId)
        .eq("academic_year_id", academicYearId)
        .order("sequence", { ascending: false })
        .limit(1)
        .maybeSingle();
      sequence = Number(existing?.sequence ?? 0) + 1;
    }

    const { data: term, error } = await db
      .from("terms")
      .insert({
        school_id: membership.schoolId,
        academic_year_id: academicYearId,
        name: data.title,
        sequence,
        starts_on: data.eventDate,
        ends_on: data.endsOn,
      })
      .select("id, name, starts_on, ends_on, sequence")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o período lectivo.");
    return {
      id: term.id,
      title: term.name,
      description: data.description ?? `Período lectivo ${term.sequence ?? ""}`.trim(),
      event_date: term.starts_on,
      ends_on: term.ends_on,
      category: "academic" as const,
    };
  });

export const updateCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateCalendarEventInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    if (data.endsOn < data.eventDate) {
      throw new Error("A data de fim não pode ser anterior ao início.");
    }
    const db = await loadSgaAdminClient();
    const { data: term, error } = await db
      .from("terms")
      .update({
        name: data.title,
        starts_on: data.eventDate,
        ends_on: data.endsOn,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id, name, starts_on, ends_on, sequence")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o período.");
    if (!term) throw new Error("Período não encontrado.");
    return {
      id: term.id,
      title: term.name,
      description: `Período lectivo ${term.sequence ?? ""}`.trim(),
      event_date: term.starts_on,
      ends_on: term.ends_on,
      category: "academic" as const,
    };
  });

export const deleteCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteCalendarEventInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: term, error } = await db
      .from("terms")
      .delete()
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id")
      .maybeSingle();
    if (error) {
      throw publicDatabaseError(
        error,
        "Não foi possível apagar o período. Pode estar ligado a notas ou horários.",
      );
    }
    if (!term) throw new Error("Período não encontrado.");
    return { id: term.id };
  });
