/** Civil date at the institution, independent of the device's timezone. */
export function schoolTodayIso(now: Date, timeZone = "Africa/Luanda"): string {
  if (Number.isNaN(now.getTime())) throw new Error("Data actual inválida.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (part: "year" | "month" | "day") => parts.find((item) => item.type === part)?.value;
  const year = get("year"),
    month = get("month"),
    day = get("day");
  if (!year || !month || !day) throw new Error("Fuso institucional inválido.");
  return `${year}-${month}-${day}`;
}
