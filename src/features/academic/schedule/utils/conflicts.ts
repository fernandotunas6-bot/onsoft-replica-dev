import type { ScheduleConflict, ScheduleSlot } from "../types";

function timeValue(value: string) {
  // Compare complete HH:mm:ss, not only HH:mm: second-level overlaps matter.
  const [hours = "00", minutes = "00", seconds = "00"] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * Etiquetas que significam «sala por atribuir». A mesma lista está na base, em
 * `private.timetable_room_is_explicit` (migração 20261010100000): «Sala» é o que o
 * ecrã grava sem sala escolhida e «S/N» o que a base gravava sem rótulo.
 */
export const PLACEHOLDER_ROOM_LABELS = ["sala", "s/n", "a definir", "sem sala fixa"] as const;

function isExplicitRoomLabel(value: string | null | undefined): boolean {
  const label = value?.trim().toLocaleLowerCase() ?? "";
  return Boolean(label) && !(PLACEHOLDER_ROOM_LABELS as readonly string[]).includes(label);
}

function overlaps(left: ScheduleSlot, right: ScheduleSlot) {
  return (
    left.weekday === right.weekday &&
    timeValue(left.starts_at) < timeValue(right.ends_at) &&
    timeValue(left.ends_at) > timeValue(right.starts_at)
  );
}

export function detectScheduleConflicts(slots: ScheduleSlot[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const seen = new Set<string>();

  for (let leftIndex = 0; leftIndex < slots.length; leftIndex += 1) {
    const left = slots[leftIndex];
    if (!left) continue;
    for (const right of slots.slice(leftIndex + 1)) {
      // Aulas em versões distintas não coexistem por definição. A verificação
      // de vigências entre versões publicadas pertence ao guard transacional.
      if ((left.schedule_id ?? null) !== (right.schedule_id ?? null)) continue;
      if (!overlaps(left, right)) continue;

      const checks = [
        {
          key: "turma",
          kind: "turma" as const,
          severity: "blocker" as const,
          matches: Boolean(left.class_group_id) && left.class_group_id === right.class_group_id,
          message: `A turma ${left.class_group_name} tem dois slots sobrepostos.`,
        },
        {
          key: "docente",
          kind: "docente" as const,
          severity: "blocker" as const,
          matches: Boolean(left.teacher_id) && left.teacher_id === right.teacher_id,
          message: `O professor ${left.teacher_name || "atribuído"} tem dois slots sobrepostos.`,
        },
        {
          key: "sala",
          kind: "sala" as const,
          severity: "blocker" as const,
          matches:
            (Boolean(left.room_id) && left.room_id === right.room_id) ||
            (isExplicitRoomLabel(left.label) &&
              left.label?.trim().toLocaleLowerCase() === right.label?.trim().toLocaleLowerCase()),
          message: `A sala ${left.room_name || left.label} está ocupada em dois slots sobrepostos.`,
        },
      ];

      for (const check of checks) {
        const key = `${check.key}:${left.id}:${right.id}`;
        if (!check.matches || seen.has(key)) continue;
        seen.add(key);
        conflicts.push({
          id: key,
          message: check.message,
          slotIds: [left.id, right.id],
          kind: check.kind,
          severity: check.severity,
        });
      }
    }
  }

  return conflicts;
}
