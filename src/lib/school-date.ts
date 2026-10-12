/**
 * Data civil da escola («hoje»), independente do fuso do servidor ou do dispositivo.
 *
 * `new Date().toISOString().slice(0, 10)` dá o dia em UTC. Angola é UTC+1 todo o ano: entre a
 * meia-noite e a 01:00 de Luanda o dia UTC ainda é o de ontem, e um pagamento, uma chamada ou
 * uma matrícula feitos nessa hora ficavam com a data errada. Usar sempre esta função para «hoje».
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

// Os importadores chamam isto por linha: o formatador cria-se uma vez por fuso.
function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function schoolTodayIso(now: Date = new Date(), timeZone = "Africa/Luanda"): string {
  if (Number.isNaN(now.getTime())) throw new Error("Data actual inválida.");
  const parts = formatterFor(timeZone).formatToParts(now);
  const get = (part: "year" | "month" | "day") => parts.find((item) => item.type === part)?.value;
  const year = get("year"),
    month = get("month"),
    day = get("day");
  if (!year || !month || !day) throw new Error("Fuso institucional inválido.");
  return `${year}-${month}-${day}`;
}

/** «Hoje» na escola mais `days` dias (negativo para trás), também em data de Luanda. */
export function schoolDayOffsetIso(days: number, now: Date = new Date()): string {
  return schoolTodayIso(new Date(now.getTime() + days * 86_400_000));
}

/**
 * Número de proforma pela data e hora de emissão em Luanda (FP-AAAAMMDD-HHMMSS).
 * A proforma não é documento fiscal: não precisa de série sequencial, e o antigo
 * «total de faturas + 1» repetia-se entre utilizadores e misturava séries.
 */
export function proformaNumber(now: Date = new Date(), timeZone = "Africa/Luanda"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `FP-${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}
