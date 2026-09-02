/** Datas civis do calendário lectivo (fuso Africa/Luanda). Sem Date local ambíguo. */

export function todayInLuanda(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda" }).format(now);
}

export function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function addDaysIso(value: string, days: number) {
  const parsed = parseIsoDate(value);
  if (!parsed) return value.slice(0, 10);
  const utc = Date.UTC(parsed.year, parsed.month - 1, parsed.day + days);
  const date = new Date(utc);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addMonthsYm(yearMonth: string, delta: number) {
  const [yearRaw, monthRaw] = yearMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month) return yearMonth;
  const utc = Date.UTC(year, month - 1 + delta, 1);
  const date = new Date(utc);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = segunda … 6 = domingo (semana angolana). */
export function weekdayMonday0(value: string) {
  const parsed = parseIsoDate(value);
  if (!parsed) return 0;
  const utcDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return (utcDay + 6) % 7;
}

export function isoInInclusiveRange(day: string, start: string, end: string) {
  const value = day.slice(0, 10);
  if (!value) return false;
  if (start && value < start.slice(0, 10)) return false;
  if (end && value > end.slice(0, 10)) return false;
  return true;
}

export type TermLifecycle = "em_curso" | "futuro" | "concluido";

export function termLifecycle(startsOn: string, endsOn: string, today: string): TermLifecycle {
  const start = startsOn.slice(0, 10);
  const end = endsOn.slice(0, 10);
  if (today < start) return "futuro";
  if (today > end) return "concluido";
  return "em_curso";
}

export const termLifecycleLabels: Record<TermLifecycle, string> = {
  em_curso: "Em curso",
  futuro: "Próximo",
  concluido: "Concluído",
};

export function inclusiveRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart.slice(0, 10) <= bEnd.slice(0, 10) && bStart.slice(0, 10) <= aEnd.slice(0, 10);
}

/** Fim sugerido (~um trimestre) sem invadir o período seguinte. */
export function suggestTermEnd(
  start: string,
  existing: Array<{ event_date: string; ends_on?: string | null }>,
  spanDays = 89,
) {
  const begin = start.slice(0, 10);
  let end = addDaysIso(begin, spanDays);
  const next = existing
    .filter((term) => term.event_date.slice(0, 10) > begin)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
  if (next) {
    const dayBefore = addDaysIso(next.event_date, -1);
    if (dayBefore < end) end = dayBefore;
  }
  return end < begin ? begin : end;
}

export function inclusiveDaysLeft(end: string, today: string) {
  const last = end.slice(0, 10);
  const day = today.slice(0, 10);
  if (!last || day > last) return 0;
  const startMs = Date.parse(`${day}T00:00:00Z`);
  const endMs = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

export type AcademicYearPhase = "not_started" | "in_progress" | "ended";

export function academicYearProgress(
  startsOn: string,
  endsOn: string,
  today: string,
): { percent: number; phase: AcademicYearPhase } {
  const start = startsOn.slice(0, 10);
  const end = endsOn.slice(0, 10);
  const day = today.slice(0, 10);
  if (!start || !end || end < start) return { percent: 0, phase: "not_started" };
  if (day < start) return { percent: 0, phase: "not_started" };
  if (day > end) return { percent: 100, phase: "ended" };
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const todayMs = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { percent: 0, phase: "in_progress" };
  }
  const percent = Math.round(((todayMs - startMs) / (endMs - startMs)) * 100);
  return { percent: Math.max(0, Math.min(100, percent)), phase: "in_progress" };
}

export function monthsCovered(fromIso: string, toIso: string) {
  const months: string[] = [];
  let yearMonth = fromIso.slice(0, 7);
  const endYm = toIso.slice(0, 7);
  if (!yearMonth || !endYm) return months;
  while (yearMonth <= endYm) {
    months.push(yearMonth);
    yearMonth = addMonthsYm(yearMonth, 1);
    if (months.length > 24) break;
  }
  return months;
}
