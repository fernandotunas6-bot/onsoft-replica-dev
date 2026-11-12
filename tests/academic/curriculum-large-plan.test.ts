import { describe, expect, it } from "vitest";
import {
  EDUCATION_LEVELS,
  LARGE_PLAN_TURMAS,
  needsLargePlanConfirmation,
  planCurriculum,
  summarizePlan,
} from "@/features/academic/curriculum-templates";

/**
 * «Criar estrutura» com muitas turmas pede uma segunda confirmação. A 22/10 um
 * modelo de todos os níveis criou 192 turmas vazias num instituto superior.
 */
describe("modelo de estrutura — confirmação de planos grandes", () => {
  it("pede confirmação acima do limite e não abaixo", () => {
    expect(needsLargePlanConfirmation({ turmas: LARGE_PLAN_TURMAS })).toBe(false);
    expect(needsLargePlanConfirmation({ turmas: LARGE_PLAN_TURMAS + 1 })).toBe(true);
  });

  it("todos os níveis com todos os cursos passam o limite", () => {
    const courses = Object.fromEntries(
      EDUCATION_LEVELS.map((l) => [l.id, l.courses.map((c) => c.code)]),
    );
    const summary = summarizePlan(
      planCurriculum({
        courses,
        groupsPerGrade: 1,
        shifts: ["morning", "afternoon"],
        capacity: 35,
        createRooms: true,
      } as Parameters<typeof planCurriculum>[0]),
    );
    expect(needsLargePlanConfirmation(summary)).toBe(true);
  });

  it("um só nível pequeno não pede confirmação", () => {
    const level = EDUCATION_LEVELS[0]!;
    const summary = summarizePlan(
      planCurriculum({
        courses: { [level.id]: [level.courses[0]!.code] },
        groupsPerGrade: 1,
        shifts: ["morning"],
        capacity: 35,
        createRooms: false,
      } as Parameters<typeof planCurriculum>[0]),
    );
    expect(summary.turmas).toBeGreaterThan(0);
    expect(needsLargePlanConfirmation(summary)).toBe(false);
  });
});
