import { describe, expect, it, vi } from "vitest";
import { toIcsCalendar, toIcsTimedCalendar } from "@/features/calendar/ics";

describe("ICS text serialization", () => {
  for (const timed of [false, true]) {
    const render = (text: string) => {
      const fields = { title: text, description: text, uid: text };
      return timed
        ? toIcsTimedCalendar([
            { ...fields, starts_at: "2026-10-09T09:00:00+01:00", location: text },
          ])
        : toIcsCalendar([{ ...fields, event_date: "2026-10-09", ends_on: "2026-10-10" }]);
    };

    it(`escapes all newline formats in ${timed ? "timed" : "all-day"} events`, () => {
      const ics = render("A\r\nB\rC\nEND:VEVENT");
      expect(ics).toContain("SUMMARY:A\\nB\\nC\\nEND:VEVENT");
      expect(ics).toContain("UID:A\\nB\\nC\\nEND:VEVENT");
      expect(ics.split("\r\n").filter((line) => line === "END:VEVENT")).toHaveLength(1);
      expect(ics.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
    });

    it(`includes a UTC publication stamp in ${timed ? "timed" : "all-day"} events`, () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-09T19:00:00+01:00"));
      try {
        const ics = render("Aula");
        expect(ics).toContain("DTSTAMP:20261009T180000Z\r\n");
        expect(ics.match(/^DTSTAMP:/gm)).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it(`folds UTF-8 lines without losing text in ${timed ? "timed" : "all-day"} events`, () => {
      const title = "Educação 📚, avaliação; ".repeat(12);
      const ics = render(title);
      for (const line of ics.split("\r\n")) {
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      }
      const unfolded = ics.replace(/\r\n /g, "");
      expect(unfolded).toContain(`SUMMARY:${title.replaceAll(",", "\\,").replaceAll(";", "\\;")}`);
      expect(unfolded).not.toContain("�");
      expect(ics.endsWith("\r\n")).toBe(true);
    });
  }

  it("normalizes newlines in calendar metadata", () => {
    const ics = toIcsCalendar([], { calendarName: "Escola\r\nBié", calendarDescription: "A\rB" });
    expect(ics).toContain("X-WR-CALNAME:Escola\\nBié");
    expect(ics).toContain("X-WR-CALDESC:A\\nB");
  });
});
