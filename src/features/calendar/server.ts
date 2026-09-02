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
import { todayInLuanda, inclusiveRangesOverlap } from "./dates";

export type CalendarEventSummary = {
  id: string;
  title: string;
  description: string;
  event_date: string;
  ends_on: string;
  category: "academic";
  sequence: number;
  academic_year_id: string;
};

function mapTerm(term: Record<string, unknown>, description?: string): CalendarEventSummary {
  const sequence = Number(term["sequence"] ?? 0);
  return {
    id: String(term["id"] ?? ""),
    title: String(term["name"] ?? ""),
    description: description ?? `Período lectivo ${sequence || ""}`.trim(),
    event_date: String(term["starts_on"] ?? ""),
    ends_on: String(term["ends_on"] ?? ""),
    category: "academic",
    sequence,
    academic_year_id: String(term["academic_year_id"] ?? ""),
  };
}

export const listCalendarEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listCalendarEventsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();

    const fromDate = data.fromDate ?? todayInLuanda();
    let query = db
      .from("terms")
      .select("id, name, starts_on, ends_on, sequence, academic_year_id")
      .eq("school_id", membership.schoolId);
    if (data.academicYearId) {
      query = query.eq("academic_year_id", data.academicYearId);
    }
    if (!data.includePast || !data.academicYearId) {
      query = query.gte("ends_on", fromDate);
    }
    const { data: terms, error } = await query
      .order("starts_on", { ascending: true })
      .limit(data.limit);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar o calendário lectivo.");

    return (terms ?? []).map((term: Record<string, unknown>) => mapTerm(term));
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

    await assertNoTermOverlap(db, membership.schoolId, academicYearId, data.eventDate, data.endsOn);

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
      .select("id, name, starts_on, ends_on, sequence, academic_year_id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o período lectivo.");
    return mapTerm(term as Record<string, unknown>, data.description);
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
    const { data: current } = await db
      .from("terms")
      .select("academic_year_id")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (current?.academic_year_id) {
      await assertNoTermOverlap(
        db,
        membership.schoolId,
        String(current.academic_year_id),
        data.eventDate,
        data.endsOn,
        data.id,
      );
    }
    const { data: term, error } = await db
      .from("terms")
      .update({
        name: data.title,
        starts_on: data.eventDate,
        ends_on: data.endsOn,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("id, name, starts_on, ends_on, sequence, academic_year_id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o período.");
    if (!term) throw new Error("Período não encontrado.");
    return mapTerm(term as Record<string, unknown>);
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

async function assertNoTermOverlap(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  academicYearId: string,
  startsOn: string,
  endsOn: string,
  excludeId?: string,
) {
  let query = db
    .from("terms")
    .select("id, name, starts_on, ends_on")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId);
  if (excludeId) query = query.neq("id", excludeId);
  const { data: existing, error } = await query.limit(40);
  if (error) throw publicDatabaseError(error, "Não foi possível validar o período lectivo.");
  const overlap = (existing ?? []).find((term) =>
    inclusiveRangesOverlap(
      startsOn,
      endsOn,
      String(term.starts_on ?? ""),
      String(term.ends_on ?? term.starts_on ?? ""),
    ),
  );
  if (overlap) {
    throw new Error(`Este intervalo sobrepõe-se a «${String(overlap.name ?? "outro período")}».`);
  }
}
