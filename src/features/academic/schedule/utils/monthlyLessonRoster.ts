import type { LessonOccurrence, PlanningResult } from "./academicTime";
import { parseCivilDate, parseLocalMinute } from "./academicTime";

/**
 * Deterministic monthly roster for attendance reconciliation.
 * This is a preview: server must derive it from the immutable published
 * schedule, school calendar and teacher assignments, never client input.
 */
export type MonthlyLessonRoster = {
  year: number; month: number; teacherId: string;
  lessonIds: string[];
  lessonMinutes: Record<string, number>;
  totalScheduledMinutes: number;
  scheduledDates: string[];
};
export function buildMonthlyLessonRoster(
  plan: PlanningResult, teacherId: string, year: number, month: number,
): MonthlyLessonRoster {
  if (plan.issues.length) throw new Error("Plano lectivo com pendências; não é possível apurar o mês.");
  if (!teacherId.trim() || !Number.isInteger(year) || year < 1900 || year > 2200 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Docente ou mês inválido.");
  }
  const prefix = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-";
  const selected = plan.occurrences.filter((entry) => entry.teacherId === teacherId && entry.date.startsWith(prefix));
  const lessonMinutes: Record<string, number> = Object.create(null);
  const lessonIds: string[] = [];
  const dates = new Set<string>();
  let totalScheduledMinutes = 0;
  for (const entry of selected) {
    validateOccurrence(entry);
    const occurrenceId = entry.id + "@" + entry.date;
    if (Object.hasOwn(lessonMinutes, occurrenceId)) {
      throw new Error("Ocorrência duplicada no horário oficial.");
    }
    const minutes = parseLocalMinute(entry.end) - parseLocalMinute(entry.start);
    lessonMinutes[occurrenceId] = minutes;
    lessonIds.push(occurrenceId);
    dates.add(entry.date);
    totalScheduledMinutes += minutes;
    if (!Number.isSafeInteger(totalScheduledMinutes)) throw new Error("Carga horária mensal inválida.");
  }
  lessonIds.sort();
  return { year, month, teacherId, lessonIds, lessonMinutes,
    totalScheduledMinutes, scheduledDates: [...dates].sort() };
}
function validateOccurrence(entry: LessonOccurrence): void {
  parseCivilDate(entry.date);
  if (!entry.id || !entry.teacherId || !entry.classGroupId ||
      !entry.startsAtLocal.startsWith(entry.date + "T") ||
      !entry.endsAtLocal.startsWith(entry.date + "T") ||
      entry.startsAtLocal !== entry.date + "T" + entry.start ||
      entry.endsAtLocal !== entry.date + "T" + entry.end ||
      parseLocalMinute(entry.end) <= parseLocalMinute(entry.start)) {
    throw new Error("Ocorrência lectiva inconsistente.");
  }
}
