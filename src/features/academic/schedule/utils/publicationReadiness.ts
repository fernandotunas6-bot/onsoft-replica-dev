import type { ScheduleClassGroup, ScheduleRoom, ScheduleSlot, ScheduleSubject, ScheduleTeacher } from "../types";
import { detectScheduleConflicts } from "./conflicts";
import { assertValidScheduleTime } from "./validation";

export type PublicationIssue = {
  code: "empty" | "subject" | "teacher" | "room" | "class" | "capacity" | "time" | "conflict" | "version";
  message: string;
  slotId?: string;
};

export function schedulePublicationReadiness(input: {
  classGroupId: string;
  slots: ScheduleSlot[];
  classGroups: ScheduleClassGroup[];
  subjects: ScheduleSubject[];
  teachers: ScheduleTeacher[];
  rooms: ScheduleRoom[];
}): { ready: boolean; issues: PublicationIssue[]; lessonCount: number; teacherCount: number; roomCount: number } {
  const { classGroupId, slots, classGroups, subjects, teachers, rooms } = input;
  const classSlots = slots.filter((slot) => slot.class_group_id === classGroupId);
  const versionIds = new Set(classSlots.map((slot) => slot.schedule_id ?? "__legacy__"));
  // Publishing by class alone is ambiguous if multiple timetable versions are loaded.
  // Fail closed rather than validating lessons from a mixture of versions.
  const own = classSlots;
  const group = classGroups.find((item) => item.id === classGroupId);
  const issues: PublicationIssue[] = [];
  if (!group) issues.push({ code: "class", message: "Seleccione uma turma válida." });
  if (versionIds.size > 1) issues.push({ code: "version", message: "Existem várias versões desta turma. Seleccione uma versão antes de publicar." });
  if (own.length === 0) issues.push({ code: "empty", message: "Adicione pelo menos uma aula antes de publicar." });
  if (own.length > 0 && own.every((slot) => slot.schedule_id == null))
    issues.push({ code: "version", message: "Associe as aulas a uma versão identificada do horário antes de publicar." });
  const knownSubjects = new Set(subjects.map((item) => item.id));
  const knownTeachers = new Set(teachers.map((item) => item.id));
  const roomById = new Map(rooms.map((item) => [item.id, item]));
  for (const slot of own) {
    if (!slot.subject_id || !knownSubjects.has(slot.subject_id))
      issues.push({ code: "subject", slotId: slot.id, message: `Disciplina por definir: ${slot.display_label}.` });
    if (!slot.teacher_id || !knownTeachers.has(slot.teacher_id))
      issues.push({ code: "teacher", slotId: slot.id, message: `Professor por atribuir: ${slot.display_label}.` });
    if (!slot.room_id || !roomById.has(slot.room_id))
      issues.push({ code: "room", slotId: slot.id, message: `Sala por atribuir: ${slot.display_label}.` });
    else if (group && group.enrolled_count > 0) {
      const capacity = roomById.get(slot.room_id)?.capacity;
      if (capacity == null || !Number.isFinite(capacity) || capacity <= 0)
        issues.push({ code: "capacity", slotId: slot.id, message: `Defina a lotação da sala de ${slot.display_label} antes de publicar.` });
      else if (capacity < group.enrolled_count)
        issues.push({ code: "capacity", slotId: slot.id, message: `A sala de ${slot.display_label} não comporta ${group.enrolled_count} alunos.` });
    }
    try {
      assertValidScheduleTime(slot.weekday, slot.starts_at, slot.ends_at);
    } catch {
      issues.push({ code: "time", slotId: slot.id, message: `Dia ou intervalo inválido: ${slot.display_label}.` });
    }
  }
  // Drafts from different schedule versions must not be treated as simultaneous.
  // A missing version ID is legacy data and remains in the local comparison.
  const version = own[0]?.schedule_id ?? null;
  const relatedSlots = slots.filter((slot) => (slot.schedule_id ?? null) === version);
  const ownIds = new Set(own.map((slot) => slot.id));
  const relatedConflicts = detectScheduleConflicts(relatedSlots).filter((conflict) =>
    conflict.slotIds.some((id) => ownIds.has(id)),
  );
  for (const conflict of relatedConflicts)
    issues.push({ code: "conflict", message: conflict.message });
  return {
    ready: issues.length === 0,
    issues,
    lessonCount: own.length,
    teacherCount: new Set(own.map((slot) => slot.teacher_id).filter(Boolean)).size,
    roomCount: new Set(own.map((slot) => slot.room_id).filter(Boolean)).size,
  };
}
