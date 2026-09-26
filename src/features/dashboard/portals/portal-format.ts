/** Textos e datas comuns aos portais (sem componentes: não quebra o fast refresh). */

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function greetingFor(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? "Bom dia" : hour < 19 ? "Boa tarde" : "Boa noite";
}

export function relativeDayLabel(daysAhead: number, weekday: number) {
  if (daysAhead === 0) return "Hoje";
  if (daysAhead === 1) return "Amanhã";
  return WEEKDAY_LABELS[weekday] ?? "";
}

/** "2026-10-02" → "sexta-feira, 2 de outubro" (ou "2 de outubro" sem dia da semana). */
export function formatPortalDate(isoDate: string, withWeekday = true) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat("pt-PT", {
    ...(withWeekday ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "2026-09-25" → "25/09/2026"; outros formatos ficam como vieram. */
export function formatPortalShortDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
