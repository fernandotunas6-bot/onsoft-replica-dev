import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildUpcomingCalendarItems, upcomingItemHint } from "@/features/calendar/upcoming";

const root = resolve(import.meta.dirname, "../..");

describe("Topbar calendar mini-agenda contract", () => {
  it("surfaces current terms before future holidays for the agenda list", () => {
    const today = "2026-09-07";
    const items = buildUpcomingCalendarItems(
      [
        {
          id: "t1",
          title: "1.º Trimestre",
          description: null,
          event_date: "2026-09-01",
          ends_on: "2026-12-15",
        },
        {
          id: "t2",
          title: "2.º Trimestre",
          description: null,
          event_date: "2027-01-10",
          ends_on: "2027-04-01",
        },
      ],
      today,
      5,
    );

    expect(items[0]?.id).toBe("t1");
    expect(upcomingItemHint(items[0]!, today)).toBe("Em curso");
    expect(items.some((item) => item.category === "holiday")).toBe(true);
  });

  it("loads day timetable lessons alongside periods", () => {
    const source = readFileSync(resolve(root, "src/components/layout/TopbarCalendar.tsx"), "utf8");
    expect(source).toContain("listDayAgendaLessons");
    expect(source).toContain("Aulas de hoje");
    expect(source).toContain("takeUpcomingDayLessons");
    expect(source).toContain("agendaLessonActions");
    expect(source).toContain("Chamada");
  });
});
