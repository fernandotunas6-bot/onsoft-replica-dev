import type { ScheduleClassSubject, ScheduleSlot } from "../types";

export type WeeklyScheduleCoverage = {
  subjectId: string;
  subjectName: string;
  requiredPeriods: number;
  plannedPeriods: number;
  missingPeriods: number;
  excessPeriods: number;
};

export function getWeeklyScheduleCoverage(slots: ScheduleSlot[], classSubjects: ScheduleClassSubject[], classGroupId: string): WeeklyScheduleCoverage[] {
  const plannedBySubject = new Map<string, number>();
  const subjectNameById = new Map<string, string>();
  for (const slot of slots) {
    if (slot.class_group_id !== classGroupId || !slot.subject_id) continue;
    plannedBySubject.set(slot.subject_id, (plannedBySubject.get(slot.subject_id) ?? 0) + 1);
    if (slot.subject_name) subjectNameById.set(slot.subject_id, slot.subject_name);
  }
  return classSubjects
    .filter((item) => item.class_group_id === classGroupId)
    .map((item) => {
      const requiredPeriods = Number(item.weekly_periods);
      const plannedPeriods = plannedBySubject.get(item.subject_id) ?? 0;
      return {
        subjectId: item.subject_id,
        subjectName: subjectNameById.get(item.subject_id) ?? "Disciplina",
        requiredPeriods,
        plannedPeriods,
        missingPeriods: Math.max(0, requiredPeriods - plannedPeriods),
        excessPeriods: Math.max(0, plannedPeriods - requiredPeriods),
      };
    })
    .filter((item) => Number.isSafeInteger(item.requiredPeriods) && item.requiredPeriods > 0)
    .sort((left, right) =>
      (right.missingPeriods + right.excessPeriods) - (left.missingPeriods + left.excessPeriods) ||
      left.subjectName.localeCompare(right.subjectName),
    );
}
