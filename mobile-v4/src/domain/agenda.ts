import type { AcademicSlot, AcademicTask } from "./catalog";

export const WEEKDAYS = [
  "",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

/** Data, dia da semana ISO (1 = segunda) e hora em Luanda. */
export function luandaClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Luanda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const weekday = new Date(date + "T12:00:00Z").getUTCDay() || 7;
  return { date, weekday, clock: `${part("hour")}:${part("minute")}` };
}

const hhmm = (t: string) => t.slice(0, 5);

export type SlotState = "now" | "next" | null;

/**
 * Horário semanal agrupado por dia, a começar em hoje, cada dia por hora. No
 * dia de hoje marca o período a decorrer e o seguinte. É o horário publicado:
 * não confirma que a aula aconteceu.
 */
export function scheduleByDay<T extends AcademicSlot>(
  slots: T[],
  today: { weekday: number; clock: string },
) {
  const days = new Map<number, T[]>();
  for (const slot of slots) days.set(slot.weekday, [...(days.get(slot.weekday) ?? []), slot]);
  return [...days.entries()]
    .sort(([a], [b]) => ((a - today.weekday + 7) % 7) - ((b - today.weekday + 7) % 7))
    .map(([weekday, list]) => {
      const isToday = weekday === today.weekday;
      const sorted = list.sort(
        (a, b) => a.startsAt.localeCompare(b.startsAt) || a.slotId.localeCompare(b.slotId),
      );
      const next = isToday ? sorted.find((s) => hhmm(s.startsAt) > today.clock) : undefined;
      return {
        weekday,
        label: (isToday ? "Hoje · " : "") + WEEKDAYS[weekday],
        isToday,
        slots: sorted.map((slot) => ({
          slot,
          state: (!isToday
            ? null
            : hhmm(slot.startsAt) <= today.clock && today.clock < hhmm(slot.endsAt)
              ? "now"
              : slot === next
                ? "next"
                : null) as SlotState,
        })),
      };
    });
}

const days = (from: string, to: string) =>
  Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000);

/** «Hoje», «Amanhã», «Faltam 3 dias», «Terminou ontem», «Terminou há 4 dias». */
export function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  const d = days(today, due.slice(0, 10));
  if (Number.isNaN(d)) return null;
  if (d === 0) return "Hoje";
  if (d === 1) return "Amanhã";
  if (d > 1) return `Faltam ${d} dias`;
  return d === -1 ? "Terminou ontem" : `Terminou há ${-d} dias`;
}

/**
 * Trabalhos por entregar (prazo hoje ou depois, do mais próximo; os sem prazo
 * no fim) e com o prazo terminado (do mais recente). Não sabe das entregas.
 */
export function taskBuckets<T extends AcademicTask>(tasks: T[], today: string) {
  const open = tasks
    .filter((t) => !t.due || t.due.slice(0, 10) >= today)
    .sort(
      (a, b) =>
        (a.due ? 0 : 1) - (b.due ? 0 : 1) ||
        (a.due ?? "").localeCompare(b.due ?? "") ||
        a.title.localeCompare(b.title, "pt"),
    );
  const closed = tasks
    .filter((t) => t.due && t.due.slice(0, 10) < today)
    .sort((a, b) => b.due!.localeCompare(a.due!) || a.title.localeCompare(b.title, "pt"));
  return { open, closed };
}
