import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { rpcArgs } from "@/integrations/supabase/sga";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  createSubjectTypeInputSchema,
  updateSubjectTypeInputSchema,
  createCurriculumAreaInputSchema,
  updateCurriculumAreaInputSchema,
  createRoomInputSchema,
  updateRoomInputSchema,
  createSchoolShiftInputSchema,
  saveCurriculumMatrixInputSchema,
  saveTeacherAvailabilityInputSchema,
  publishAcademicScheduleInputSchema,
  createScheduleSlotInputSchema,
  updateScheduleSlotInputSchema,
} from "./schemas";
import { z } from "zod";
import { schoolTodayIso } from "@/lib/school-date";

function timeSlice(value: unknown): string {
  return String(value ?? "").slice(0, 5);
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return timeSlice(startA) < timeSlice(endB) && timeSlice(endA) > timeSlice(startB);
}

// ---------------------------------------------------------------------------
// 1. TIPOS DE DISCIPLINAS
// ---------------------------------------------------------------------------
export const listSubjectTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();

    const { data, error } = await db
      .from("subject_types")
      .select("*")
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      // Se tabela ainda não aplicada, retornar fallback seguro
      return [];
    }
    return data ?? [];
  });

export const createSubjectType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createSubjectTypeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    const { data: created, error } = await db
      .from("subject_types")
      .insert({
        school_id: membership.schoolId,
        code: data.code,
        name: data.name,
        description: data.description,
        counts_for_gpa: data.countsForGpa,
        appears_in_pauta: data.appearsInPauta,
        has_exam: data.hasExam,
        can_fail: data.canFail,
        is_mandatory: data.isMandatory,
        default_weight: data.defaultWeight,
        requires_special_room: data.requiresSpecialRoom,
        allows_simultaneous_classes: data.allowsSimultaneousClasses,
        requires_specialized_teacher: data.requiresSpecializedTeacher,
        color: data.color,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível criar o tipo de disciplina.");
    return created;
  });

export const updateSubjectType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSubjectTypeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    const updatePayload: TablesUpdate<"subject_types"> = {
      updated_by: context.userId,
    };
    if (data.code !== undefined) updatePayload.code = data.code;
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.countsForGpa !== undefined) updatePayload.counts_for_gpa = data.countsForGpa;
    if (data.appearsInPauta !== undefined) updatePayload.appears_in_pauta = data.appearsInPauta;
    if (data.hasExam !== undefined) updatePayload.has_exam = data.hasExam;
    if (data.canFail !== undefined) updatePayload.can_fail = data.canFail;
    if (data.isMandatory !== undefined) updatePayload.is_mandatory = data.isMandatory;
    if (data.defaultWeight !== undefined) updatePayload.default_weight = data.defaultWeight;
    if (data.requiresSpecialRoom !== undefined)
      updatePayload.requires_special_room = data.requiresSpecialRoom;
    if (data.color !== undefined) updatePayload.color = data.color;
    if (data.status !== undefined) updatePayload.status = data.status;

    const { data: updated, error } = await db
      .from("subject_types")
      .update(updatePayload)
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível atualizar o tipo de disciplina.");
    return updated;
  });

// ---------------------------------------------------------------------------
// 2. ÁREAS CURRICULARES
// ---------------------------------------------------------------------------
export const listCurriculumAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();

    const { data, error } = await db
      .from("curriculum_areas")
      .select("*")
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("display_order", { ascending: true });

    if (error) return [];
    return data ?? [];
  });

export const createCurriculumArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createCurriculumAreaInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    const { data: created, error } = await db
      .from("curriculum_areas")
      .insert({
        school_id: membership.schoolId,
        code: data.code,
        name: data.name,
        description: data.description,
        color: data.color,
        display_order: data.displayOrder,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível criar a área curricular.");
    return created;
  });

// ---------------------------------------------------------------------------
// 3. SALAS DE AULA (rooms)
// ---------------------------------------------------------------------------
export const listRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();

    const { data, error } = await db
      .from("rooms")
      .select("*")
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) throw publicDatabaseError(error, "Não foi possível listar as salas.");

    // Turmas activas com sala fixa (`class_groups.room_id`), para a coluna "Turmas".
    const { data: groups, error: groupsError } = await db
      .from("class_groups")
      .select("id, name, room_id")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .not("room_id", "is", null)
      .order("name", { ascending: true });
    if (groupsError) throw publicDatabaseError(groupsError, "Não foi possível listar as turmas.");
    const turmasBySala = new Map<string, string[]>();
    for (const group of groups ?? []) {
      if (!group.room_id) continue;
      turmasBySala.set(group.room_id, [...(turmasBySala.get(group.room_id) ?? []), group.name]);
    }

    return (data ?? []).map((room) => ({ ...room, turmas: turmasBySala.get(room.id) ?? [] }));
  });

export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createRoomInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    const { data: created, error } = await db
      .from("rooms")
      .insert({
        school_id: membership.schoolId,
        code: data.code,
        name: data.name,
        capacity: data.capacity,
        room_type: data.roomType,
        building: data.building,
        block: data.block,
        floor: data.floor,
        resources: data.resources,
        accessibility: data.accessibility,
        notes: data.notes,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível criar a sala.");
    return created;
  });

export const updateRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateRoomInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    // Desactivar uma sala em uso deixava aulas activas do horário e turmas a
    // apontar para uma sala que já não aparece para escolher (auditoria 13).
    if (data.status === "inactive") {
      const [slots, groups] = await Promise.all([
        db
          .from("timetable_slots")
          .select("id", { count: "exact", head: true })
          .eq("school_id", membership.schoolId)
          .eq("room_id", data.id)
          .eq("status", "active"),
        db
          .from("class_groups")
          .select("id", { count: "exact", head: true })
          .eq("school_id", membership.schoolId)
          .eq("room_id", data.id)
          .eq("status", "active"),
      ]);
      if (slots.error)
        throw publicDatabaseError(slots.error, "Não foi possível verificar o horário.");
      if (groups.error)
        throw publicDatabaseError(groups.error, "Não foi possível verificar as turmas.");
      const inUse = [
        slots.count ? `${slots.count} aula(s) activa(s) no horário` : null,
        groups.count ? `${groups.count} turma(s) como sala própria` : null,
      ].filter(Boolean);
      if (inUse.length) {
        throw new Error(
          `Esta sala está em uso (${inUse.join(" e ")}). Mude-as para outra sala antes de a desactivar.`,
        );
      }
    }

    const updatePayload: TablesUpdate<"rooms"> = {
      updated_by: context.userId,
    };
    if (data.code !== undefined) updatePayload.code = data.code;
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.capacity !== undefined) updatePayload.capacity = data.capacity;
    if (data.roomType !== undefined) updatePayload.room_type = data.roomType;
    if (data.building !== undefined) updatePayload.building = data.building;
    if (data.block !== undefined) updatePayload.block = data.block;
    if (data.floor !== undefined) updatePayload.floor = data.floor;
    if (data.resources !== undefined) updatePayload.resources = data.resources;
    if (data.accessibility !== undefined) updatePayload.accessibility = data.accessibility;
    if (data.notes !== undefined) updatePayload.notes = data.notes;
    if (data.status !== undefined) updatePayload.status = data.status;

    const { data: updated, error } = await db
      .from("rooms")
      .update(updatePayload)
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível atualizar a sala.");
    return updated;
  });

// ---------------------------------------------------------------------------
// 4. TURNOS ESCOLARES (school_shifts)
// ---------------------------------------------------------------------------
export const listSchoolShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();

    const { data, error } = await db
      .from("school_shifts")
      .select("*, slots:school_shift_slots(*)")
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("starts_at", { ascending: true });

    if (error) return [];
    return data ?? [];
  });

export const saveSchoolShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createSchoolShiftInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    const startsAt = data.startsAt.length === 5 ? `${data.startsAt}:00` : data.startsAt;
    const endsAt = data.endsAt.length === 5 ? `${data.endsAt}:00` : data.endsAt;

    const { data: shift, error } = await db
      .from("school_shifts")
      .upsert(
        {
          school_id: membership.schoolId,
          code: data.code,
          name: data.name,
          starts_at: startsAt,
          ends_at: endsAt,
          default_lesson_duration: data.defaultLessonDuration,
          default_break_duration: data.defaultBreakDuration,
          active_days: data.activeDays,
          color: data.color,
          updated_by: context.userId,
        },
        { onConflict: "school_id,code" },
      )
      .select("*")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível salvar o turno.");
    return shift;
  });

// ---------------------------------------------------------------------------
// 5. MATRIZ CURRICULAR (curricula & curriculum_subjects)
// ---------------------------------------------------------------------------
export const listCurricula = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        academicYearId: z.string().uuid().optional(),
        courseId: z.string().uuid().optional(),
        gradeLevelId: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();

    let query = db
      .from("curricula")
      .select(
        `
        *,
        curriculum_subjects (
          *,
          subject:subjects(id, code, name),
          subject_type:subject_types(id, code, name, color)
        )
      `,
      )
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null);

    if (data.academicYearId) query = query.eq("academic_year_id", data.academicYearId);
    if (data.courseId) query = query.eq("course_id", data.courseId);
    if (data.gradeLevelId) query = query.eq("grade_level_id", data.gradeLevelId);

    const { data: curricula, error } = await query.order("created_at", { ascending: false });
    if (error) return [];
    return curricula ?? [];
  });

export const saveCurriculumMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveCurriculumMatrixInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    // 1. Inserir ou recuperar matriz principal
    const { data: curriculum, error: curError } = await db
      .from("curricula")
      .upsert(
        {
          school_id: membership.schoolId,
          academic_year_id: data.academicYearId,
          course_id: data.courseId,
          grade_level_id: data.gradeLevelId,
          name: data.name,
          description: data.description,
          updated_by: context.userId,
        },
        { onConflict: "school_id,academic_year_id,course_id,grade_level_id" },
      )
      .select("id")
      .single();

    if (curError || !curriculum) {
      throw publicDatabaseError(
        curError,
        "Não foi possível guardar o cabeçalho da matriz curricular.",
      );
    }

    // 2. Substituir disciplinas da matriz — apagar + reinserir numa única
    // chamada RPC, para que fique atómico (uma falha na inserção não pode
    // deixar a matriz sem nenhuma disciplina).
    const { error: subError } = await db.rpc("replace_curriculum_subjects", {
      p_school_id: membership.schoolId,
      p_curriculum_id: curriculum.id,
      p_rows: data.subjects.map((sub) => ({
        subjectId: sub.subjectId,
        subjectTypeId: sub.subjectTypeId ?? null,
        weeklyPeriods: sub.weeklyPeriods,
        periodDurationMinutes: sub.periodDurationMinutes,
        isMandatory: sub.isMandatory,
        displayOrder: sub.displayOrder,
      })),
      p_actor: context.userId,
    });
    if (subError) {
      throw publicDatabaseError(
        subError,
        "Não foi possível salvar as disciplinas da matriz curricular.",
      );
    }

    return { id: curriculum.id, success: true };
  });

// ---------------------------------------------------------------------------
// 6. DISPONIBILIDADE DOCENTE (teacher_availability)
// ---------------------------------------------------------------------------
export const listTeacherAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        teacherId: z.string().uuid(),
        academicYearId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();

    let query = db
      .from("teacher_availability")
      .select("*")
      .eq("school_id", membership.schoolId)
      .eq("teacher_id", data.teacherId)
      .is("deleted_at", null);

    if (data.academicYearId) {
      query = query.eq("academic_year_id", data.academicYearId);
    }

    const { data: availability, error } = await query.order("weekday", { ascending: true });
    if (error) return [];
    return availability ?? [];
  });

export const saveTeacherAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveTeacherAvailabilityInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    // Limpar anteriores e inserir novos — numa única chamada RPC, para que
    // fique atómico (uma falha na inserção não pode deixar o professor sem
    // nenhuma disponibilidade registada).
    const { error } = await db.rpc(
      "replace_teacher_availability",
      rpcArgs("replace_teacher_availability", {
        p_school_id: membership.schoolId,
        p_teacher_id: data.teacherId,
        p_academic_year_id: data.academicYearId ?? null,
        p_max_weekly_hours: data.maxWeeklyHours,
        p_rows: data.slots.map((s) => ({
          weekday: s.weekday,
          startsAt: s.startsAt.length === 5 ? `${s.startsAt}:00` : s.startsAt,
          endsAt: s.endsAt.length === 5 ? `${s.endsAt}:00` : s.endsAt,
          isAvailable: s.isAvailable,
          notes: s.notes ?? null,
        })),
        p_actor: context.userId,
      }),
    );
    if (error)
      throw publicDatabaseError(error, "Não foi possível guardar a disponibilidade docente.");

    return { success: true };
  });

// ---------------------------------------------------------------------------
// 7. MOTOR AVANÇADO DE CONFLITOS DE HORÁRIO
// ---------------------------------------------------------------------------
export type ScheduleConflictDetail = {
  kind: "teacher" | "room" | "class_group" | "capacity" | "availability" | "shift";
  message: string;
  severity: "blocker" | "warning";
  slotId?: string;
};

export async function assertScheduleSlotConflictsDetailed({
  db,
  schoolId,
  classGroupId,
  teacherId,
  roomId,
  weekday,
  startsAt,
  endsAt,
  roomLabel,
  excludeSlotId,
}: {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  classGroupId: string;
  teacherId: string | null;
  roomId?: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
  roomLabel?: string | null;
  excludeSlotId?: string;
}): Promise<ScheduleConflictDetail[]> {
  const conflicts: ScheduleConflictDetail[] = [];

  // 1. Validar capacidade da sala (se houver sala e turma)
  if (roomId) {
    const [{ data: roomData }, { data: groupData }] = await Promise.all([
      db
        .from("rooms")
        .select("id, name, capacity")
        .eq("id", roomId)
        .eq("school_id", schoolId)
        .maybeSingle(),
      db
        .from("class_groups")
        .select("id, name, capacity")
        .eq("id", classGroupId)
        .eq("school_id", schoolId)
        .maybeSingle(),
    ]);

    // Só quem ocupa lugar: matrículas anuladas, transferidas ou concluídas não
    // estão na sala. `enrollments` não tem `deleted_at`.
    const { count: enrolledCount } = await db
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_group_id", classGroupId)
      .eq("school_id", schoolId)
      .in("status", ["pending", "active"]);

    const actualStudents = enrolledCount ?? groupData?.capacity ?? 0;
    if (roomData?.capacity && actualStudents > roomData.capacity) {
      conflicts.push({
        kind: "capacity",
        message: `Conflito de capacidade: A turma ${groupData?.name ?? ""} tem ${actualStudents} alunos, mas a sala ${roomData.name} suporta apenas ${roomData.capacity}.`,
        severity: "warning",
      });
    }
  }

  // 2. Validar disponibilidade docente
  if (teacherId) {
    const { data: availabilities } = await db
      .from("teacher_availability")
      .select("weekday, starts_at, ends_at, is_available")
      .eq("school_id", schoolId)
      .eq("teacher_id", teacherId)
      .eq("weekday", weekday);

    if (availabilities && availabilities.length > 0) {
      const match = availabilities.find(
        (a) =>
          a.is_available &&
          timeSlice(a.starts_at) <= timeSlice(startsAt) &&
          timeSlice(a.ends_at) >= timeSlice(endsAt),
      );
      if (!match) {
        conflicts.push({
          kind: "availability",
          message:
            "O professor selecionado não tem disponibilidade cadastrada neste dia e horário.",
          severity: "warning",
        });
      }
    }
  }

  // 3. Buscar slots concorrentes
  let query = db
    .from("timetable_slots")
    .select("id, class_subject_id, starts_at, ends_at, room, room_id")
    .eq("school_id", schoolId)
    .eq("weekday", weekday)
    .eq("status", "active");

  if (excludeSlotId) query = query.neq("id", excludeSlotId);

  const { data: slots } = await query;
  const overlappingSlots = (slots ?? []).filter((s) =>
    timesOverlap(startsAt, endsAt, s.starts_at, s.ends_at),
  );

  if (overlappingSlots.length > 0) {
    const classSubjectIds = [...new Set(overlappingSlots.map((s) => String(s.class_subject_id)))];
    const { data: classSubjects } = await db
      .from("class_subjects")
      .select("id, class_group_id, teacher_id")
      .eq("school_id", schoolId)
      .in("id", classSubjectIds);

    const subjectMap = new Map((classSubjects ?? []).map((cs) => [String(cs.id), cs]));

    for (const slot of overlappingSlots) {
      const cs = subjectMap.get(String(slot.class_subject_id));

      // Conflito de Turma
      if (cs && String(cs.class_group_id) === classGroupId) {
        conflicts.push({
          kind: "class_group",
          message: "Esta turma já possui uma aula atribuída neste mesmo horário.",
          severity: "blocker",
          slotId: slot.id,
        });
      }

      // Conflito de Professor
      if (teacherId && cs && String(cs.teacher_id) === teacherId) {
        conflicts.push({
          kind: "teacher",
          message: "O professor atribuído já está a lecionar noutra turma neste horário.",
          severity: "blocker",
          slotId: slot.id,
        });
      }

      // Conflito de Sala
      const sameRoomId = roomId && slot.room_id && slot.room_id === roomId;
      const sameRoomLabel =
        roomLabel?.trim() &&
        slot.room?.trim() &&
        roomLabel.trim().toLowerCase() === slot.room.trim().toLowerCase();

      if (sameRoomId || sameRoomLabel) {
        conflicts.push({
          kind: "room",
          message: "A sala selecionada já está ocupada por outra turma neste horário.",
          severity: "blocker",
          slotId: slot.id,
        });
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// 8. CRIAÇÃO & EDIÇÃO AVANÇADA DE SLOTS
// ---------------------------------------------------------------------------
export const createAdvancedScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createScheduleSlotInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    const startsAt = data.startsAt.length === 5 ? `${data.startsAt}:00` : data.startsAt;
    const endsAt = data.endsAt.length === 5 ? `${data.endsAt}:00` : data.endsAt;
    const room = data.label?.trim() || "Sala";

    // Avisos não-bloqueantes (capacidade da sala, disponibilidade docente).
    // Os conflitos bloqueantes (professor/sala/turma sobrepostos) NÃO são
    // decididos aqui — são verificados de novo, atomicamente, dentro do RPC
    // abaixo, para fechar a corrida entre "verificar" e "inserir": duas
    // chamadas concorrentes a esta função podiam antes passar ambas nesta
    // verificação (nenhum dos dois slots existia ainda) e ambas inserir,
    // duplicando a reserva apesar da validação "rígida".
    const warnings = (
      await assertScheduleSlotConflictsDetailed({
        db,
        schoolId: membership.schoolId,
        classGroupId: data.classGroupId,
        teacherId: data.teacherId ?? null,
        roomId: data.roomId,
        weekday: data.weekday,
        startsAt,
        endsAt,
        roomLabel: room,
      })
    ).filter((c) => c.severity === "warning");

    const { data: slot, error } = await db.rpc(
      "create_timetable_slot_guarded",
      rpcArgs("create_timetable_slot_guarded", {
        p_school_id: membership.schoolId,
        p_class_group_id: data.classGroupId,
        p_subject_id: data.subjectId,
        p_teacher_id: data.teacherId ?? null,
        p_room_id: data.roomId ?? null,
        p_weekday: data.weekday,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_room_label: room,
        p_shift_id: data.shiftId ?? null,
        p_schedule_id: data.scheduleId ?? null,
        p_day_period_number: data.dayPeriodNumber ?? null,
        p_notes: data.notes ?? null,
        p_actor: context.userId,
      }),
    );

    if (error) {
      if (error.code === "23505") throw new Error(error.message);
      throw publicDatabaseError(error, "Não foi possível criar o slot de horário.");
    }
    return { slot, warnings };
  });

export const updateAdvancedScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateScheduleSlotInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
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
      .select("class_group_id")
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

    // Mesma lógica de create_timetable_slot_guarded: avisos não-bloqueantes
    // calculados aqui, conflitos bloqueantes decididos atomicamente dentro
    // do RPC (protegido por advisory lock), excluindo o próprio slot.
    const warnings = (
      await assertScheduleSlotConflictsDetailed({
        db,
        schoolId: membership.schoolId,
        classGroupId: String(classSubject.class_group_id),
        teacherId: data.teacherId ?? null,
        roomId: data.roomId,
        weekday: data.weekday,
        startsAt,
        endsAt,
        roomLabel: room,
        excludeSlotId: data.slotId,
      })
    ).filter((c) => c.severity === "warning");

    const { data: slot, error } = await db.rpc(
      "update_timetable_slot_guarded",
      rpcArgs("update_timetable_slot_guarded", {
        p_school_id: membership.schoolId,
        p_slot_id: data.slotId,
        p_subject_id: data.subjectId ?? null,
        p_teacher_id: data.teacherId ?? null,
        p_room_id: data.roomId ?? null,
        p_weekday: data.weekday,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_room_label: room,
        p_shift_id: data.shiftId ?? null,
        p_schedule_id: data.scheduleId ?? null,
        p_day_period_number: data.dayPeriodNumber ?? null,
        p_notes: data.notes ?? null,
        p_actor: context.userId,
      }),
    );

    if (error) {
      if (error.code === "23505") throw new Error(error.message);
      throw publicDatabaseError(error, "Não foi possível actualizar o slot de horário.");
    }
    return { slot, warnings };
  });

// ---------------------------------------------------------------------------
// 9. PUBLICAÇÃO E VERSIONAMENTO DO HORÁRIO
// ---------------------------------------------------------------------------
export const publishAcademicSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => publishAcademicScheduleInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    // O ano lectivo é o da turma, não o que o cliente diz.
    const { data: classGroup, error: classGroupError } = await db
      .from("class_groups")
      .select("id, academic_year_id")
      .eq("id", data.classGroupId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (classGroupError) {
      throw publicDatabaseError(classGroupError, "Não foi possível validar a turma.");
    }
    if (!classGroup) throw new Error("Turma não encontrada nesta escola.");
    if (String(classGroup.academic_year_id) !== data.academicYearId) {
      throw new Error("A turma não pertence ao ano lectivo indicado.");
    }

    // A publicação é uma operação de fecho: não pode criar uma versão que
    // ignore a carga semanal previamente configurada para a turma.
    const { data: classSubjects, error: classSubjectsError } = await db
      .from("class_subjects")
      .select("id, weekly_periods")
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", data.classGroupId)
      .eq("status", "active");
    if (classSubjectsError) {
      throw publicDatabaseError(classSubjectsError, "Não foi possível validar a carga semanal.");
    }
    if (!classSubjects || classSubjects.length === 0) {
      throw new Error("Associe disciplinas activas à turma antes de publicar o horário.");
    }

    const classSubjectIds = classSubjects.map((item) => item.id);
    const { data: slots, error: slotsError } = await db
      .from("timetable_slots")
      .select("class_subject_id")
      .eq("school_id", membership.schoolId)
      .in("class_subject_id", classSubjectIds)
      .eq("status", "active");
    if (slotsError) {
      throw publicDatabaseError(slotsError, "Não foi possível validar os slots do horário.");
    }

    const plannedByClassSubject = new Map<string, number>();
    for (const slot of slots ?? []) {
      plannedByClassSubject.set(
        String(slot.class_subject_id),
        (plannedByClassSubject.get(String(slot.class_subject_id)) ?? 0) + 1,
      );
    }
    const invalidWorkload = classSubjects.filter((item) => {
      const required = Number(item.weekly_periods);
      return !Number.isSafeInteger(required) || required <= 0;
    });
    if (invalidWorkload.length > 0) {
      throw new Error(
        `Configure uma carga semanal válida para ${invalidWorkload.length} disciplina(s) antes de publicar.`,
      );
    }
    const mismatchedWorkload = classSubjects.filter(
      (item) => (plannedByClassSubject.get(String(item.id)) ?? 0) !== Number(item.weekly_periods),
    );
    if (mismatchedWorkload.length > 0) {
      throw new Error(
        `Existem ${mismatchedWorkload.length} disciplina(s) com tempos semanais em falta ou em excesso. Corrija antes de publicar.`,
      );
    }
    if ((slots ?? []).length === 0) {
      throw new Error("Adicione pelo menos uma aula activa antes de publicar o horário.");
    }

    // 1. Versão nova = maior número + 1. Contar as linhas repetia um número
    // (chave única `academic_schedules_version_key`) quando uma versão era apagada.
    const { data: lastVersion, error: lastVersionError } = await db
      .from("academic_schedules")
      .select("version_number")
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", data.classGroupId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastVersionError) {
      throw publicDatabaseError(lastVersionError, "Não foi possível ler as versões do horário.");
    }
    const nextVersion = Number(lastVersion?.version_number ?? 0) + 1;
    const { data: schedule, error: schedError } = await db
      .from("academic_schedules")
      .insert({
        school_id: membership.schoolId,
        academic_year_id: data.academicYearId,
        class_group_id: data.classGroupId,
        version_number: nextVersion,
        name: data.name ?? `Horário V${nextVersion}`,
        status: "published",
        valid_from: data.validFrom ?? schoolTodayIso(),
        valid_to: data.validTo ?? null,
        published_at: new Date().toISOString(),
        published_by: context.userId,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (schedError) {
      throw publicDatabaseError(schedError, "Não foi possível publicar o horário.");
    }
    if (!schedule) {
      throw new Error("Não foi possível publicar o horário.");
    }

    // Só uma versão publicada por turma: as anteriores passam a arquivo.
    const { error: archiveError } = await db
      .from("academic_schedules")
      .update({ status: "archived", updated_by: context.userId })
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", data.classGroupId)
      .eq("status", "published")
      .neq("id", schedule.id);
    if (archiveError) {
      throw publicDatabaseError(
        archiveError,
        "Horário publicado, mas a versão anterior não foi arquivada.",
      );
    }

    // 2. Associar slots ativos da turma a esta versão de horário
    if (classSubjects.length > 0) {
      const csIds = classSubjectIds;
      await db
        .from("timetable_slots")
        .update({ schedule_id: schedule.id, updated_by: context.userId })
        .eq("school_id", membership.schoolId)
        .in("class_subject_id", csIds)
        .eq("status", "active");
    }

    // 3. Sincronizar com Calendário / Presenças se solicitado
    let generatedSessions = 0;
    if (data.syncToCalendar) {
      generatedSessions = await syncScheduleSlotsToSessions({
        db,
        schoolId: membership.schoolId,
        classGroupId: data.classGroupId,
        academicYearId: data.academicYearId,
        userId: context.userId,
      });
    }

    // Avisar professores e alunos da turma (configurável; nunca falha a publicação).
    const { notifySchedulePublished } = await import("./timetable-lessons");
    const notified = await notifySchedulePublished(db, {
      schoolId: membership.schoolId,
      classGroupId: data.classGroupId,
      validFrom: data.validFrom ?? null,
      scheduleId: String(schedule.id),
    });

    return { schedule, generatedSessions, notified, success: true };
  });

// ---------------------------------------------------------------------------
// 10. SINCRONIZAÇÃO HORÁRIO -> SESSÕES / CALENDÁRIO
// ---------------------------------------------------------------------------
async function syncScheduleSlotsToSessions({
  db,
  schoolId,
  classGroupId,
  academicYearId,
  userId,
}: {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  classGroupId: string;
  academicYearId: string;
  userId: string;
}): Promise<number> {
  // Obter período lectivo ativo (term)
  const { data: currentTerm } = await db
    .from("terms")
    .select("starts_on, ends_on")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .lte("starts_on", schoolTodayIso())
    .gte("ends_on", schoolTodayIso())
    .maybeSingle();

  const startDate = currentTerm?.starts_on ?? schoolTodayIso();
  const endDate =
    currentTerm?.ends_on ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  // Buscar slots da turma
  const { data: classSubjects } = await db
    .from("class_subjects")
    .select("id, subject_id, teacher_id")
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId)
    .eq("status", "active");

  if (!classSubjects || classSubjects.length === 0) return 0;

  const csMap = new Map(classSubjects.map((c) => [c.id, c]));
  const csIds = classSubjects.map((c) => c.id);

  const { data: slots } = await db
    .from("timetable_slots")
    .select("id, class_subject_id, weekday, starts_at, ends_at, room")
    .eq("school_id", schoolId)
    .in("class_subject_id", csIds)
    .eq("status", "active");

  if (!slots || slots.length === 0) return 0;

  // Materializar próximas 4 semanas (exemplo de janela lectiva controlada para não sobrecarregar).
  // Constrói primeiro a lista completa de candidatos (slot, data) e resolve tudo em
  // apenas 2 pedidos à base de dados (1 SELECT + 1 INSERT em lote), em vez de um
  // SELECT+INSERT sequencial por cada par (dia, slot) — o que antes chegava a
  // centenas de idas e vindas para uma única publicação de horário.
  const start = new Date(startDate);
  const end = new Date(endDate);
  const maxEnd = new Date(Math.min(end.getTime(), start.getTime() + 28 * 86400000));

  const candidates: Array<{ slot: (typeof slots)[number]; dateStr: string }> = [];
  for (let d = new Date(start); d <= maxEnd; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay(); // 0=Dom, 1=Seg, ... 5=Sex
    if (jsDay === 0) continue;

    const dateStr = d.toISOString().slice(0, 10);
    for (const slot of slots.filter((s) => s.weekday === jsDay)) {
      if (csMap.has(slot.class_subject_id)) candidates.push({ slot, dateStr });
    }
  }

  if (candidates.length === 0) return 0;

  const slotIds = [...new Set(candidates.map((c) => c.slot.id))];
  const { data: existingSessions } = await db
    .from("siga_attendance_sessions")
    .select("timetable_slot_id, lesson_date")
    .eq("school_id", schoolId)
    .in("timetable_slot_id", slotIds)
    .gte("lesson_date", startDate)
    .lte("lesson_date", endDate);

  const existingKeys = new Set(
    (existingSessions ?? []).map((r) => `${r.timetable_slot_id}:${r.lesson_date}`),
  );

  const rowsToInsert = candidates
    .filter((c) => !existingKeys.has(`${c.slot.id}:${c.dateStr}`))
    .map(({ slot, dateStr }) => {
      const cs = csMap.get(slot.class_subject_id)!;
      return {
        school_id: schoolId,
        academic_year_id: academicYearId,
        class_group_id: classGroupId,
        subject_id: cs.subject_id,
        teacher_id: cs.teacher_id,
        timetable_slot_id: slot.id,
        lesson_date: dateStr,
        starts_at: timeSlice(slot.starts_at),
        ends_at: timeSlice(slot.ends_at),
        status: "pending",
        created_by: userId,
      };
    });

  if (rowsToInsert.length === 0) return 0;

  const { error } = await db.from("siga_attendance_sessions").insert(rowsToInsert);
  if (error)
    throw publicDatabaseError(error, "Não foi possível sincronizar as sessões de presença.");

  return rowsToInsert.length;
}

// ---------------------------------------------------------------------------
// 11. PAINEL "AGORA NA ESCOLA" & RECOMENDAÇÕES INTELIGENTES
// ---------------------------------------------------------------------------
export const getSchoolNowOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) {
      return {
        nowTime: "00:00",
        classesActiveNow: 0,
        teachersActiveNow: 0,
        roomsOccupiedNow: 0,
        roomsFreeNow: 0,
        totalRooms: 0,
        recommendations: [],
      };
    }
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;

    const now = new Date();
    const nowTime = now.toTimeString().slice(0, 5);
    const weekday = now.getDay() === 0 ? 7 : now.getDay();

    // 1. Total de salas cadastradas
    const { data: rooms } = await db
      .from("rooms")
      .select("id, name, capacity, room_type")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .eq("status", "active");

    const totalRooms = rooms?.length ?? 0;

    // 2. Slots do dia corrente
    const { data: todaySlots } = await db
      .from("timetable_slots")
      .select("id, class_subject_id, starts_at, ends_at, room, room_id")
      .eq("school_id", schoolId)
      .eq("weekday", weekday)
      .eq("status", "active");

    // Filtrar slots ativos neste exacto minuto
    const activeSlots = (todaySlots ?? []).filter(
      (s) => timeSlice(s.starts_at) <= nowTime && timeSlice(s.ends_at) > nowTime,
    );

    const occupiedRoomIds = new Set(activeSlots.map((s) => s.room_id).filter(Boolean));
    const occupiedRoomNames = new Set(
      activeSlots.map((s) => s.room?.trim().toLowerCase()).filter(Boolean),
    );

    const occupiedCount = (rooms ?? []).filter(
      (r) => occupiedRoomIds.has(r.id) || occupiedRoomNames.has(r.name.trim().toLowerCase()),
    ).length;

    // Turmas e professores em aula
    const csIds = [...new Set(activeSlots.map((s) => s.class_subject_id))];
    let classesActiveNow = 0;
    let teachersActiveNow = 0;

    if (csIds.length > 0) {
      const { data: csRows } = await db
        .from("class_subjects")
        .select("class_group_id, teacher_id")
        .eq("school_id", schoolId)
        .in("id", csIds);

      classesActiveNow = new Set((csRows ?? []).map((c) => c.class_group_id)).size;
      teachersActiveNow = new Set((csRows ?? []).map((c) => c.teacher_id).filter(Boolean)).size;
    }

    // Recomendações determinísticas inteligentes
    const recommendations: string[] = [];
    if (
      totalRooms > 0 &&
      occupiedCount / totalRooms < 0.3 &&
      now.getHours() >= 8 &&
      now.getHours() <= 16
    ) {
      recommendations.push("Taxa de ocupação de salas abaixo de 30%. Avalie otimização de turmas.");
    }
    if (
      activeSlots.length === 0 &&
      weekday >= 1 &&
      weekday <= 5 &&
      now.getHours() >= 9 &&
      now.getHours() <= 15
    ) {
      recommendations.push(
        "Nenhuma aula em curso neste momento letivo. Verifique se os horários foram publicados.",
      );
    }

    return {
      nowTime,
      classesActiveNow,
      teachersActiveNow,
      roomsOccupiedNow: occupiedCount,
      roomsFreeNow: Math.max(0, totalRooms - occupiedCount),
      totalRooms,
      recommendations,
    };
  });
