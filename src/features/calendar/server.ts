import { createServerFn } from "@tanstack/react-start";
import {
  workflowRpcClient,
  activeYearResultSchema,
  assertWorkflowRpcAvailable,
} from "@/integrations/supabase/workflow-rpcs";
import { requireAal2 } from "@/features/hr/require-aal2";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  createAcademicYearInputSchema,
  createCalendarEventInputSchema,
  deleteCalendarEventInputSchema,
  listCalendarEventsInputSchema,
  listDayAgendaLessonsInputSchema,
  setActiveAcademicYearInputSchema,
  updateCalendarEventInputSchema,
} from "./schemas";
import { todayInLuanda, inclusiveRangesOverlap } from "./dates";
import type { DayAgendaLesson } from "./day-lessons";
import { loadDayAgendaLessons } from "./day-lessons-server";

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

export const listDayAgendaLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listDayAgendaLessonsInputSchema.parse(input ?? {}))
  .handler(({ data, context }): Promise<DayAgendaLesson[]> => loadDayAgendaLessons(data, context));

/** Ano lectivo activo da escola, ou `null` — é o que destranca períodos e propinas. */
export const getActiveAcademicYear = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return null;
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("academic_years")
      .select("id, name, starts_on, ends_on, status")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .order("starts_on", { ascending: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível carregar o ano lectivo.");
    return data ?? null;
  });

/**
 * Anos lectivos marcados como activos. Deve ser um; mais do que um é um erro de
 * dados (a 2026-09-29 uma escola tinha quatro, três deles de testes) e o ecrã
 * mostra-os para a escola escolher. Leva as turmas e matrículas de cada um para
 * se ver qual é o verdadeiro.
 */
export const listActiveAcademicYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: years, error } = await db
      .from("academic_years")
      .select("id, name, starts_on, ends_on")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .order("starts_on", { ascending: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os anos lectivos.");
    const rows = (years ?? []) as Array<{
      id: string;
      name: string;
      starts_on: string | null;
      ends_on: string | null;
    }>;
    if (rows.length < 2) {
      return rows.map((year) => ({ ...year, classGroups: 0, enrollments: 0 }));
    }
    const ids = rows.map((year) => year.id);
    const [groups, enrollments] = await Promise.all([
      db
        .from("class_groups")
        .select("academic_year_id")
        .eq("school_id", membership.schoolId)
        .in("academic_year_id", ids),
      db
        .from("enrollments")
        .select("academic_year_id")
        .eq("school_id", membership.schoolId)
        .in("academic_year_id", ids),
    ]);
    if (groups.error) throw publicDatabaseError(groups.error, "Não foi possível contar as turmas.");
    if (enrollments.error) {
      throw publicDatabaseError(enrollments.error, "Não foi possível contar as matrículas.");
    }
    const count = (list: Array<{ academic_year_id: string | null }> | null, id: string) =>
      (list ?? []).filter((row) => row.academic_year_id === id).length;
    return rows.map((year) => ({
      ...year,
      classGroups: count(groups.data, year.id),
      enrollments: count(enrollments.data, year.id),
    }));
  });

/** Torna um ano o activo e fecha os outros (um ano activo de cada vez). */
export const setActiveAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setActiveAcademicYearInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador"],
    );
    requireAal2(context.claims, "Activar o ano lectivo");
    const { data: result, error } = await workflowRpcClient(context.supabase).rpc(
      "siga_save_active_academic_year",
      {
        p_school_id: membership.schoolId,
        p_year_id: data.yearId,
        p_name: null,
        p_starts_on: null,
        p_ends_on: null,
      },
    );
    assertWorkflowRpcAvailable(error);
    if (error)
      throw publicDatabaseError(
        error,
        "Não foi possível guardar o ano lectivo. O ano activo anterior foi preservado.",
      );
    return activeYearResultSchema.parse(result);
  });

/**
 * Cria o primeiro ano lectivo da escola.
 *
 * Sem isto uma escola nova ficava num impasse: «Novo período» exige ano
 * lectivo activo, «Preparar estrutura» exige períodos configurados, e o
 * selector das Definições só *activa* um ano que já exista. O provisionamento
 * não inventa datas de propósito — por isso a escola tem de as indicar aqui.
 */
export const createAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createAcademicYearInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador"],
    );
    requireAal2(context.claims, "Activar o ano lectivo");
    const { data: result, error } = await workflowRpcClient(context.supabase).rpc(
      "siga_save_active_academic_year",
      {
        p_school_id: membership.schoolId,
        p_year_id: null,
        p_name: data.name,
        p_starts_on: data.startsOn,
        p_ends_on: data.endsOn,
      },
    );
    assertWorkflowRpcAvailable(error);
    if (error)
      throw publicDatabaseError(
        error,
        "Não foi possível guardar o ano lectivo. O ano activo anterior foi preservado.",
      );
    return activeYearResultSchema.parse(result);
  });

export const createCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createCalendarEventInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    if (data.endsOn < data.eventDate) {
      throw new Error("A data de fim não pode ser anterior ao início.");
    }
    const db = await loadSgaAdminClient();

    let academicYearId = data.academicYearId;
    if (academicYearId) {
      // O ano indicado tem de ser desta escola.
      const { data: ownYear, error: ownYearError } = await db
        .from("academic_years")
        .select("id")
        .eq("id", academicYearId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (ownYearError) {
        throw publicDatabaseError(ownYearError, "Não foi possível validar o ano lectivo.");
      }
      if (!ownYear) throw new Error("Ano lectivo não encontrado.");
    }
    if (!academicYearId) {
      const { data: year, error: yearError } = await db
        .from("academic_years")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .order("starts_on", { ascending: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
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
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
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
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
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
