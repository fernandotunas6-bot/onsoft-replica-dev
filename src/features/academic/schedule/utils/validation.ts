import type { ScheduleSlot } from "../types";
import { detectScheduleConflicts } from "./conflicts";

type ProposedSlot = Pick<
  ScheduleSlot,
  "class_group_id" | "teacher_id" | "room_id" | "weekday" | "starts_at" | "ends_at"
>;

function seconds(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error("Introduza uma hora válida no formato HH:mm.");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const secs = Number(match[3] ?? "0");
  if (hours > 23 || minutes > 59 || secs > 59) {
    throw new Error("A hora indicada não é válida.");
  }
  return hours * 3600 + minutes * 60 + secs;
}

export function assertValidScheduleTime(weekday: number, startsAt: string, endsAt: string): void {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new Error("Seleccione um dia válido da semana.");
  }
  if (seconds(endsAt) <= seconds(startsAt)) {
    throw new Error("A hora de fim deve ser posterior à hora de início.");
  }
}

export function assertNoScheduleConflict(
  existing: ScheduleSlot[],
  proposed: ProposedSlot,
  editingSlotId?: string,
  scheduleId?: string | null,
): void {
  assertValidScheduleTime(proposed.weekday, proposed.starts_at, proposed.ends_at);
  if (existing.some((slot) => slot.id === "__candidate__")) {
    throw new Error("Identificador reservado encontrado no horário.");
  }
  const candidate: ScheduleSlot = {
    ...proposed,
    id: "__candidate__",
    schedule_id: scheduleId ?? null,
    class_group_name: "seleccionada",
    subject_id: null,
    subject_name: null,
    teacher_name: "seleccionado",
    label: null,
    display_label: "Nova aula",
  };
  const conflicts = detectScheduleConflicts([
    ...existing.filter(
      (slot) => slot.id !== editingSlotId && (slot.schedule_id ?? null) === (scheduleId ?? null),
    ),
    candidate,
  ]).filter((conflict) => conflict.slotIds.includes(candidate.id));
  if (conflicts.length > 0) {
    const resources = [...new Set(conflicts.map((conflict) => conflict.kind))].join(", ");
    throw new Error(`Conflito de horário: ${resources}. Altere o dia, a hora ou o recurso.`);
  }
}
