import { addDaysIso, isoDate, parseIsoDate } from "./dates";

export type AngolaHoliday = {
  date: string;
  name: string;
  kind: "fixed" | "movable";
};

/** Computus gregoriano (Anonymous) — Páscoa ocidental. */
export function easterSundayIso(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

/**
 * Feriados nacionais de Angola usados no calendário lectivo (Luanda).
 * Fixos da Lei n.º 11/18 e móveis (Carnaval, Sexta-feira Santa).
 */
export function angolaHolidaysForYear(year: number): AngolaHoliday[] {
  const easter = easterSundayIso(year);
  const goodFriday = addDaysIso(easter, -2);
  const carnival = addDaysIso(easter, -47);
  return [
    { date: isoDate(year, 1, 1), name: "Ano Novo", kind: "fixed" },
    {
      date: isoDate(year, 2, 4),
      name: "Dia do Início da Luta Armada de Libertação Nacional",
      kind: "fixed",
    },
    { date: carnival, name: "Carnaval", kind: "movable" },
    { date: isoDate(year, 3, 8), name: "Dia Internacional da Mulher", kind: "fixed" },
    { date: isoDate(year, 4, 4), name: "Dia da Paz e da Reconciliação Nacional", kind: "fixed" },
    { date: goodFriday, name: "Sexta-feira Santa", kind: "movable" },
    { date: isoDate(year, 5, 1), name: "Dia Internacional do Trabalhador", kind: "fixed" },
    { date: isoDate(year, 9, 17), name: "Dia do Herói Nacional", kind: "fixed" },
    { date: isoDate(year, 11, 2), name: "Dia dos Finados", kind: "fixed" },
    { date: isoDate(year, 11, 11), name: "Dia da Independência Nacional", kind: "fixed" },
    { date: isoDate(year, 12, 25), name: "Natal", kind: "fixed" },
  ];
}

export function angolaHolidaysBetween(from: string, to: string): AngolaHoliday[] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return [];
  const seen = new Set<string>();
  const out: AngolaHoliday[] = [];
  for (let year = start.year; year <= end.year; year += 1) {
    for (const holiday of angolaHolidaysForYear(year)) {
      if (holiday.date < from.slice(0, 10) || holiday.date > to.slice(0, 10)) continue;
      if (seen.has(holiday.date)) continue;
      seen.add(holiday.date);
      out.push(holiday);
    }
  }
  return out;
}

export function holidayOn(date: string, holidays: AngolaHoliday[]) {
  const day = date.slice(0, 10);
  return holidays.find((holiday) => holiday.date === day);
}
