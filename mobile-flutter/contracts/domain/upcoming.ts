import type { AcademicCatalog } from "./catalog";
/** A recurrence of the published timetable, never proof of a lesson or attendance.
 * School holidays/cancellations are not inferred from an absent calendar record. */
export function upcomingSlots(catalog: AcademicCatalog, now = new Date(), limit = 5) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Luanda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const clock = `${part("hour")}:${part("minute")}:${part("second")}`;
  const classes = new Map(catalog.classes.map((c) => [c.classSubjectId, c]));
  const rows: {
    date: string;
    slot: AcademicCatalog["timetable"][number];
    class: AcademicCatalog["classes"][number];
  }[] = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(today + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() + i);
    const date = day.toISOString().slice(0, 10),
      weekday = day.getUTCDay() || 7;
    for (const slot of catalog.timetable) {
      const c = classes.get(slot.classSubjectId);
      if (
        !c ||
        slot.publication !== "published" ||
        slot.weekday !== weekday ||
        (slot.validFrom && date < slot.validFrom) ||
        (slot.validTo && date > slot.validTo) ||
        (date === today &&
          (slot.startsAt.length === 5 ? slot.startsAt + ":00" : slot.startsAt) <= clock)
      )
        continue;
      rows.push({ date, slot, class: c });
    }
  }
  return rows
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.slot.startsAt.localeCompare(b.slot.startsAt) ||
        a.slot.slotId.localeCompare(b.slot.slotId),
    )
    .slice(0, limit);
}
