import { addDaysIso, isoInInclusiveRange, termLifecycle } from "./dates";
import { angolaHolidaysBetween } from "./angola-holidays";

export type UpcomingCalendarItem = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  ends_on: string | null;
  category: "academic" | "holiday" | "assessment";
};

export function buildUpcomingCalendarItems(
  terms: Array<{
    id: string;
    title: string;
    description?: string | null;
    event_date: string;
    ends_on: string | null;
  }>,
  today: string,
  limit = 6,
  /** Itens de uma turma (ex.: avaliações marcadas), juntos aos períodos e feriados. */
  extras: UpcomingCalendarItem[] = [],
): UpcomingCalendarItem[] {
  const horizon = addDaysIso(today, 120);
  const termItems: UpcomingCalendarItem[] = terms
    .filter((term) => (term.ends_on || term.event_date) >= today)
    .map((term) => ({
      id: term.id,
      title: term.title,
      description: term.description ?? null,
      event_date: term.event_date,
      ends_on: term.ends_on,
      category: "academic",
    }));
  const holidayItems: UpcomingCalendarItem[] = angolaHolidaysBetween(today, horizon).map(
    (holiday) => ({
      id: `holiday-${holiday.date}`,
      title: holiday.name,
      description: "Feriado nacional · Angola",
      event_date: holiday.date,
      ends_on: holiday.date,
      category: "holiday",
    }),
  );
  const current = termItems.filter((item) =>
    isoInInclusiveRange(today, item.event_date, item.ends_on ?? item.event_date),
  );
  const extraItems = extras.filter((item) => (item.ends_on || item.event_date) >= today);
  const rest = [...termItems, ...holidayItems, ...extraItems]
    .filter((item) => !current.some((open) => open.id === item.id))
    .sort(
      (a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title, "pt"),
    );
  return [...current, ...rest].slice(0, limit);
}

export function upcomingItemHint(item: UpcomingCalendarItem, today: string) {
  if (item.category === "holiday") return "Feriado nacional";
  if (item.category === "assessment") return "Avaliação";
  const life = termLifecycle(item.event_date, item.ends_on ?? item.event_date, today);
  if (life === "em_curso") return "Em curso";
  if (life === "futuro") return "Próximo período";
  return "Concluído";
}
