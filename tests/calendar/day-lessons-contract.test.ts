import { describe, expect, it } from "vitest";
import {
  dayAgendaWeekday,
  sortDayAgendaLessons,
  takeUpcomingDayLessons,
  type DayAgendaLesson,
} from "@/features/calendar/day-lessons";

function lesson(partial: Partial<DayAgendaLesson> & Pick<DayAgendaLesson, "id" | "startsAt">): DayAgendaLesson {
  return {
    endsAt: partial.endsAt ?? "10:00",
    room: null,
    classGroupId: null,
    classGroupName: "7.ª A",
    subjectId: null,
    subjectName: "Matemática",
    teacherId: null,
    teacherName: null,
    ...partial,
  };
}

describe("day agenda lessons", () => {
  it("maps ISO dates to JS weekday like timetable_slots", () => {
    // 2026-09-07 is a Monday → 1
    expect(dayAgendaWeekday("2026-09-07")).toBe(1);
    expect(dayAgendaWeekday("2026-09-06")).toBe(0);
  });

  it("sorts by start time then class name", () => {
    const sorted = sortDayAgendaLessons([
      lesson({ id: "b", startsAt: "09:00", classGroupName: "8.ª A" }),
      lesson({ id: "a", startsAt: "08:00", classGroupName: "7.ª B" }),
      lesson({ id: "c", startsAt: "08:00", classGroupName: "7.ª A" }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("prefers remaining lessons for the topbar slice", () => {
    const rows = [
      lesson({ id: "past", startsAt: "07:00", endsAt: "07:45" }),
      lesson({ id: "now", startsAt: "08:00", endsAt: "08:45" }),
      lesson({ id: "next", startsAt: "09:00", endsAt: "09:45" }),
    ];
    expect(takeUpcomingDayLessons(rows, "08:10", 2).map((row) => row.id)).toEqual([
      "now",
      "next",
    ]);
  });
});
