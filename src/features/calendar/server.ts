import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  createAcademicYearInputSchema,
  createCalendarEventInputSchema,
  deleteCalendarEventInputSchema,
  listCalendarEventsInputSchema,
  listDayAgendaLessonsInputSchema,
  updateCalendarEventInputSchema,
} from "./schemas";
import { todayInLuanda, inclusiveRangesOverlap } from "./dates";
import { sortDayAgendaLessons, dayAgendaWeekday, type DayAgendaLesson } from "./day-lessons";

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
  .handler(async ({ data, context }): Promise<DayAgendaLesson[]> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    if (!["Administrador", "Secretaria", "Tesouraria", "Professor"].includes(membership.appRole)) {
      return [];
    }

    const date = data.date ?? todayInLuanda();
    const weekday = dayAgendaWeekday(date);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;

    const { data: slots, error: slotsError } = await db
      .from("timetable_slots")
      .select("id, class_subject_id, starts_at, ends_at, room")
      .eq("school_id", schoolId)
      .eq("weekday", weekday)
      .eq("status", "active")
      .order("starts_at", { ascending: true })
      .limit(data.limit);
    if (slotsError) {
      throw publicDatabaseError(slotsError, "Não foi possível carregar as aulas do dia.");
    }
    const slotRows = slots ?? [];
    if (slotRows.length === 0) return [];

    const classSubjectIds = [
      ...new Set(slotRows.map((slot) => String(slot.class_subject_id)).filter(Boolean)),
    ];
    const { data: classSubjects, error: csError } = await db
      .from("class_subjects")
      .select("id, class_group_id, subject_id, teacher_id")
      .eq("school_id", schoolId)
      .in("id", classSubjectIds);
    if (csError) {
      throw publicDatabaseError(csError, "Não foi possível carregar as aulas do dia.");
    }

    const classGroupIds = [
      ...new Set(
        (classSubjects ?? []).map((row) => String(row.class_group_id ?? "")).filter(Boolean),
      ),
    ];
    const subjectIds = [
      ...new Set((classSubjects ?? []).map((row) => String(row.subject_id ?? "")).filter(Boolean)),
    ];
    const teacherIds = [
      ...new Set((classSubjects ?? []).map((row) => String(row.teacher_id ?? "")).filter(Boolean)),
    ];

    const [groupsRes, subjectsRes, teachersRes] = await Promise.all([
      classGroupIds.length
        ? db
            .from("class_groups")
            .select("id, name")
            .eq("school_id", schoolId)
            .in("id", classGroupIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
      subjectIds.length
        ? db.from("subjects").select("id, name").eq("school_id", schoolId).in("id", subjectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
      teacherIds.length
        ? db.from("teachers").select("id, person_id").eq("school_id", schoolId).in("id", teacherIds)
        : Promise.resolve({
            data: [] as Array<{ id: string; person_id: string | null }>,
            error: null,
          }),
    ]);

    const loadError = groupsRes.error ?? subjectsRes.error ?? teachersRes.error;
    if (loadError) {
      throw publicDatabaseError(loadError, "Não foi possível carregar as aulas do dia.");
    }

    const teacherPersonIds = [
      ...new Set(
        (teachersRes.data ?? []).map((row) => String(row.person_id ?? "")).filter(Boolean),
      ),
    ];
    const peopleRes = teacherPersonIds.length
      ? await db
          .from("people")
          .select("id, full_name")
          .eq("school_id", schoolId)
          .in("id", teacherPersonIds)
      : { data: [] as Array<{ id: string; full_name: string }> };

    const classSubjectById = new Map((classSubjects ?? []).map((row) => [String(row.id), row]));
    const groupName = new Map(
      (groupsRes.data ?? []).map((row) => [String(row.id), String(row.name ?? "")]),
    );
    const subjectName = new Map(
      (subjectsRes.data ?? []).map((row) => [String(row.id), String(row.name ?? "")]),
    );
    const personNameById = new Map(
      (peopleRes.data ?? []).map((row) => [String(row.id), String(row.full_name ?? "")]),
    );
    const teacherName = new Map(
      (teachersRes.data ?? []).map((row) => [
        String(row.id),
        row.person_id ? (personNameById.get(String(row.person_id)) ?? "") : "",
      ]),
    );

    const lessons: DayAgendaLesson[] = slotRows.map((slot) => {
      const cs = classSubjectById.get(String(slot.class_subject_id));
      const classGroupId = cs?.class_group_id ? String(cs.class_group_id) : null;
      const subjectId = cs?.subject_id ? String(cs.subject_id) : null;
      const teacherId = cs?.teacher_id ? String(cs.teacher_id) : null;
      return {
        id: String(slot.id),
        startsAt: String(slot.starts_at ?? "").slice(0, 5),
        endsAt: String(slot.ends_at ?? "").slice(0, 5),
        room: slot.room ? String(slot.room) : null,
        classGroupId,
        classGroupName: (classGroupId && groupName.get(classGroupId)) || "Turma",
        subjectId,
        subjectName: (subjectId && subjectName.get(subjectId)) || "Disciplina",
        teacherId,
        teacherName: teacherId ? (teacherName.get(teacherId) ?? null) : null,
      };
    });

    return sortDayAgendaLessons(lessons).slice(0, data.limit);
  });

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
      .limit(1)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível carregar o ano lectivo.");
    return data ?? null;
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
    const db = await loadSgaAdminClient();

    const { data: existing, error: existingError } = await db
      .from("academic_years")
      .select("id, name")
      .eq("school_id", membership.schoolId)
      .eq("name", data.name)
      .maybeSingle();
    if (existingError) {
      throw publicDatabaseError(existingError, "Não foi possível validar o ano lectivo.");
    }

    // Um ano activo de cada vez: o resto do SIGA resolve o ano por status.
    await db
      .from("academic_years")
      .update({ status: "closed" })
      .eq("school_id", membership.schoolId)
      .eq("status", "active");

    if (existing?.id) {
      const { error } = await db
        .from("academic_years")
        .update({ starts_on: data.startsOn, ends_on: data.endsOn, status: "active" })
        .eq("id", existing.id)
        .eq("school_id", membership.schoolId);
      if (error) throw publicDatabaseError(error, "Não foi possível activar o ano lectivo.");
      return { id: existing.id as string, name: data.name, created: false };
    }

    const { data: created, error } = await db
      .from("academic_years")
      .insert({
        school_id: membership.schoolId,
        name: data.name,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o ano lectivo.");
    return { id: created.id as string, name: data.name, created: true };
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
