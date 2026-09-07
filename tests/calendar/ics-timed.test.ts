import { describe, expect, it } from "vitest";
import { toIcsTimedCalendar } from "@/features/calendar/ics";

describe("timed ICS calendar", () => {
  it("preserves start, end and location for timed events", () => {
    const ics = toIcsTimedCalendar([
      {
        uid: "alumni-event-1@siga.plus",
        title: "Encontro Alumni",
        description: "Networking e mentoria",
        starts_at: "2026-10-10T09:00:00+01:00",
        ends_at: "2026-10-10T11:30:00+01:00",
        location: "Huambo",
      },
    ], { calendarName: "SIGA · Alumni" });

    expect(ics).toContain("DTSTART:20261010T080000Z");
    expect(ics).toContain("DTEND:20261010T103000Z");
    expect(ics).toContain("LOCATION:Huambo");
    expect(ics).toContain("SUMMARY:Encontro Alumni");
  });

  it("defaults to one hour when end is absent", () => {
    const ics = toIcsTimedCalendar([{ title: "Webinar", starts_at: "2026-10-10T09:00:00Z" }]);
    expect(ics).toContain("DTSTART:20261010T090000Z");
    expect(ics).toContain("DTEND:20261010T100000Z");
  });
});
