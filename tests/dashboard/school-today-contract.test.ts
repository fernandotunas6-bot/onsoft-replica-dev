import { describe, expect, it } from "vitest";
import {
  emptySchoolTodayOps,
  isStartingWithinMinutes,
  minutesFromHhMm,
  pickNextLesson,
  weekdayJsFromIso,
} from "@/features/dashboard/school-today";

describe("school-today helpers", () => {
  it("maps ISO dates to JS weekdays (UTC noon)", () => {
    // 2026-09-07 is Monday
    expect(weekdayJsFromIso("2026-09-07")).toBe(1);
    expect(weekdayJsFromIso("2026-09-06")).toBe(0);
  });

  it("detects lessons starting within the next 30 minutes", () => {
    expect(isStartingWithinMinutes("09:15", "09:00", 30)).toBe(true);
    expect(isStartingWithinMinutes("09:45", "09:00", 30)).toBe(false);
    expect(isStartingWithinMinutes("08:50", "09:00", 30)).toBe(false);
  });

  it("picks the next unfinished lesson by clock", () => {
    const sessions = [
      { id: "a", starts_at: "08:00", ends_at: "08:45", status: "completed" },
      { id: "b", starts_at: "09:00", ends_at: "09:45", status: "pending" },
      { id: "c", starts_at: "10:00", ends_at: "10:45", status: "pending" },
    ];
    expect(pickNextLesson(sessions, "08:50")?.id).toBe("b");
    expect(pickNextLesson(sessions, "09:20")?.id).toBe("b");
    expect(pickNextLesson(sessions, "11:00")).toBeNull();
  });

  it("parses HH:MM to minutes", () => {
    expect(minutesFromHhMm("09:30")).toBe(570);
    expect(emptySchoolTodayOps("2026-09-07").lessonsScheduled).toBe(0);
  });
});
