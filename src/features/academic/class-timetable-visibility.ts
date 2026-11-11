/**
 * Controlo visual da ficha da turma. Não volta a consultar dados nem altera
 * os horários: filtra apenas os tempos já autorizados pelo servidor.
 */
export type TimetableDay = number | "todos";

export function timetableDays<T extends { weekday: number }>(slots: readonly T[]): number[] {
  return [...new Set(slots.map((slot) => slot.weekday))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}

export function visibleTimetableSlots<T extends { weekday: number }>(
  slots: readonly T[],
  day: TimetableDay,
  expanded: boolean,
  initialCount = 8,
): { total: number; items: T[] } {
  const matching = day === "todos" ? slots : slots.filter((slot) => slot.weekday === day);
  const items = expanded ? [...matching] : matching.slice(0, Math.max(0, initialCount));
  return { total: matching.length, items };
}
