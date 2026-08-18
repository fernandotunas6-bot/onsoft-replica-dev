import type { ScheduleConflict, ScheduleSlot } from "../types";

function timeValue(value: string) {
  return value.slice(0, 5);
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
      if (!overlaps(left, right)) continue;

      const checks = [
        {
          key: "turma",
          matches: Boolean(left.class_group_id) && left.class_group_id === right.class_group_id,
          message: `A turma ${left.class_group_name} tem dois slots sobrepostos.`,
        },
        {
          key: "docente",
          matches: Boolean(left.teacher_id) && left.teacher_id === right.teacher_id,
          message: "O mesmo docente tem dois slots sobrepostos.",
        },
        {
          key: "sala",
          matches:
            Boolean(left.label?.trim()) &&
            left.label?.trim().toLocaleLowerCase() === right.label?.trim().toLocaleLowerCase(),
          message: `A sala ${left.label} está ocupada em dois slots sobrepostos.`,
        },
      ];

      for (const check of checks) {
        const key = `${check.key}:${left.id}:${right.id}`;
        if (!check.matches || seen.has(key)) continue;
        seen.add(key);
        conflicts.push({ id: key, message: check.message, slotIds: [left.id, right.id] });
      }
    }
  }

  return conflicts;
}
