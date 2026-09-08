import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import {
  deleteScheduleSlotInputSchema,
  updateScheduleSlotInputSchema,
} from "./schemas";

// Preserva integralmente a fachada académica já validada e substitui apenas
// as mutações de horário que precisam de transportar o actor humano para os
// guards de service_role no PostgreSQL.
export * from "./server-secure-legacy";
export * from "./academic-calendar";
export * from "./advanced-academic-server";

function scheduleTime(value: unknown) {
  return String(value ?? "").slice(0, 5);
}

function scheduleTimesOverlap(
  startsAt: string,
  endsAt: string,
  otherStartsAt: unknown,
  otherEndsAt: unknown,
) {
  return startsAt < scheduleTime(otherEndsAt) && endsAt > scheduleTime(otherStartsAt);
}

async function assertScheduleSlotAvailable({
  db,
  schoolId,
  classGroupId,
  teacherId,
  weekday,
  startsAt,
  endsAt,
  room,
  excludeSlotId,
}: {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  classGroupId: string;
  teacherId: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string;
  excludeSlotId?: string;
}) {
  let query = db
    .from("timetable_slots")
    .select("id, class_subject_id, starts_at, ends_at, room")
    .eq("school_id", schoolId)
    .eq("weekday", weekday)
    .eq("status", "active");

  if (excludeSlotId) query = query.neq("id", excludeSlotId);

  const { data: candidateSlots, error: slotsError } = await query;
  if (slotsError) {
    throw publicDatabaseError(slotsError, "Não foi possível validar conflitos de horário.");
  }

  const overlappingSlots = (candidateSlots ?? []).filter((slot) =>
    scheduleTimesOverlap(startsAt, endsAt, slot.starts_at, slot.ends_at),
  );
  if (overlappingSlots.length === 0) return;

  const classSubjectIds = [
    ...new Set(overlappingSlots.map((slot) => String(slot.class_subject_id))),
  ];
  const { data: classSubjects, error: subjectsError } = await db
    .from("class_subjects")
    .select("id, class_group_id, teacher_id")
    .eq("school_id", schoolId)
    .in("id", classSubjectIds);
  if (subjectsError) {
    throw publicDatabaseError(subjectsError, "Não foi possível validar conflitos de horário.");
  }

  const classSubjectById = new Map(
    (classSubjects ?? []).map((subject) => [String(subject.id), subject]),
  );

  for (const slot of overlappingSlots) {
    const classSubject = classSubjectById.get(String(slot.class_subject_id));
    if (String(classSubject?.class_group_id ?? "") === classGroupId) {
      throw new Error("Esta turma já possui uma aula nesse período.");
    }
    if (teacherId && String(classSubject?.teacher_id ?? "") === teacherId) {
      throw new Error("O professor já possui uma aula nesse período.");
    }
    if (
      String(slot.room ?? "")
        .trim()
        .toLocaleLowerCase() === room.trim().toLocaleLowerCase()
    ) {
      throw new Error("A sala já está ocupada nesse período.");
    }
  }
}

export const updateScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateScheduleSlotInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: currentSlot, error: slotError } = await db
      .from("timetable_slots")
      .select("id, class_subject_id")
      .eq("id", data.slotId)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .maybeSingle();
    if (slotError) {
      throw publicDatabaseError(slotError, "Não foi possível carregar o slot de horário.");
    }
    if (!currentSlot) throw new Error("Slot não encontrado ou já inactivo.");

    const { data: classSubject, error: subjectError } = await db
      .from("class_subjects")
      .select("id, class_group_id, teacher_id")
      .eq("id", currentSlot.class_subject_id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (subjectError) {
      throw publicDatabaseError(subjectError, "Não foi possível validar o slot de horário.");
    }
    if (!classSubject) throw new Error("A disciplina deste slot já não está disponível.");

    const startsAt = data.startsAt.length === 5 ? `${data.startsAt}:00` : data.startsAt;
    const endsAt = data.endsAt.length === 5 ? `${data.endsAt}:00` : data.endsAt;
    const room = data.label?.trim() || "Sala";

    await assertScheduleSlotAvailable({
      db,
      schoolId: membership.schoolId,
      classGroupId: String(classSubject.class_group_id),
      teacherId: classSubject.teacher_id ? String(classSubject.teacher_id) : null,
      weekday: data.weekday,
      startsAt,
      endsAt,
      room,
      excludeSlotId: data.slotId,
    });

    const { data: slot, error } = await db
      .from("timetable_slots")
      .update({
        weekday: data.weekday,
        starts_at: startsAt,
        ends_at: endsAt,
        room,
        updated_by: context.userId,
      })
      .eq("id", data.slotId)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) {
      throw publicDatabaseError(error, "Não foi possível actualizar o slot de horário.");
    }
    if (!slot) throw new Error("Slot não encontrado ou já inactivo.");
    return { id: slot.id };
  });

export const deleteScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteScheduleSlotInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: slot, error } = await db
      .from("timetable_slots")
      .update({ status: "inactive", updated_by: context.userId })
      .eq("id", data.slotId)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) {
      throw publicDatabaseError(error, "Não foi possível remover o slot de horário.");
    }
    if (!slot) throw new Error("Slot não encontrado ou já inactivo.");
    return { id: slot.id };
  });
