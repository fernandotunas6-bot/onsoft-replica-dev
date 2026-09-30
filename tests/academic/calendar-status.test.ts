import { describe, expect, it } from "vitest";
import { academicCalendarKey, configuredTrimesters } from "@/features/academic/calendar-status";

describe("academic calendar context", () => {
  it("keeps school and year caches separate", () => {
    expect(academicCalendarKey("school-a", "year-a")).not.toEqual(
      academicCalendarKey("school-b", "year-a"),
    );
    expect(academicCalendarKey("school-a", "year-a")).not.toEqual(
      academicCalendarKey("school-a", "year-b"),
    );
  });

  it.each([
    [[], [1, 2, 3]],
    [[1, 2, 4], [3]],
    [[1, 2, 3, 4], []],
  ])("recognises the three grade periods in %j", (sequences, missing) => {
    expect(configuredTrimesters(sequences.map((sequence) => ({ sequence }))).missing).toEqual(
      missing,
    );
  });

  it("detects duplicate periods rather than counting them as configured", () => {
    expect(configuredTrimesters([1, 2, 2].map((sequence) => ({ sequence })))).toEqual({
      count: 2,
      missing: [3],
      duplicated: [2],
    });
  });
});
