import { describe, expect, it } from "vitest";
import { buildMonthlyLessonRoster } from "./monthlyLessonRoster";
import type { PlanningResult } from "./academicTime";

const occurrence = {
  id: "math-1",
  periodId: "term-1",
  shiftId: "morning",
  weekday: 1,
  start: "08:00",
  end: "08:45",
  teacherId: "teacher-1",
  classGroupId: "class-1",
  roomId: "room-1",
  date: "2026-09-21",
  startsAtLocal: "2026-09-21T08:00",
  endsAtLocal: "2026-09-21T08:45",
};
describe("apuramento mensal de aulas publicadas", () => {
  it("gera identificadores por data e minutos previstos sem contar intervalos", () => {
    const plan: PlanningResult = {
      issues: [],
      occurrences: [
        occurrence,
        {
          ...occurrence,
          date: "2026-09-28",
          startsAtLocal: "2026-09-28T08:00",
          endsAtLocal: "2026-09-28T08:45",
        },
      ],
    };
    const result = buildMonthlyLessonRoster(plan, "teacher-1", 2026, 9);
    expect(result.lessonIds).toEqual(["math-1@2026-09-21", "math-1@2026-09-28"]);
    expect(result.totalScheduledMinutes).toBe(90);
    expect(result.scheduledDates).toEqual(["2026-09-21", "2026-09-28"]);
  });
  it("não mistura docentes nem meses diferentes", () => {
    const plan: PlanningResult = { issues: [], occurrences: [occurrence] };
    expect(buildMonthlyLessonRoster(plan, "teacher-2", 2026, 9).lessonIds).toEqual([]);
    expect(buildMonthlyLessonRoster(plan, "teacher-1", 2026, 10).lessonIds).toEqual([]);
  });
  it("rejeita planos pendentes, duplicações e horários adulterados", () => {
    expect(() =>
      buildMonthlyLessonRoster(
        {
          issues: [{ code: "resource_collision", message: "Conflito", ids: ["math-1"] }],
          occurrences: [occurrence],
        },
        "teacher-1",
        2026,
        9,
      ),
    ).toThrow(/pendências/);
    expect(() =>
      buildMonthlyLessonRoster(
        { issues: [], occurrences: [occurrence, occurrence] },
        "teacher-1",
        2026,
        9,
      ),
    ).toThrow(/duplicada/);
    expect(() =>
      buildMonthlyLessonRoster(
        { issues: [], occurrences: [{ ...occurrence, endsAtLocal: "2026-09-21T09:00" }] },
        "teacher-1",
        2026,
        9,
      ),
    ).toThrow(/inconsistente/);
  });
});
