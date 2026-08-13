import type { ScheduleSlot } from "../types";

export function getClassGroupSchedule(slots: ScheduleSlot[], classGroupId: string) {
  return slots.filter((slot) => slot.class_group_id === classGroupId);
}

export function getTeacherSchedule(slots: ScheduleSlot[], teacherId: string) {
  return slots.filter((slot) => slot.teacher_id === teacherId);
}

export function buildScheduleChangeNotification(slot: ScheduleSlot) {
  return {
    title: "Alteração de horário",
    message: `${slot.display_label} foi actualizada no calendário académico.`,
    audience: ["teacher", "students", "coordinator"] as const,
    channels: ["system", "email", "push"] as const,
  };
}

export function exportScheduleSlotAsIcs(slot: ScheduleSlot) {
  const uid = `${slot.id}@siga`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIGA//Horarios//PT",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${slot.display_label}`,
    `DESCRIPTION:${slot.class_group_name}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
