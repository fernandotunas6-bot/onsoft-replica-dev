import { describe, expect, it } from "vitest";
import {
  createLessonPlanInputSchema,
  lessonPlanComponentInputSchema,
  listLessonPlansInputSchema,
  updateLessonPlanInputSchema,
} from "@/features/lesson-plans/schemas";

const uuid = "11111111-1111-1111-1111-111111111111";

describe("lesson-plans schemas", () => {
  it("accepts empty list input", () => {
    expect(listLessonPlansInputSchema.parse({}).limit).toBe(50);
  });

  it("requires a title and a valid term", () => {
    expect(() =>
      createLessonPlanInputSchema.parse({
        classGroupId: uuid,
        subjectId: uuid,
        term: 4,
        title: "Aula",
      }),
    ).toThrow();
    expect(() =>
      createLessonPlanInputSchema.parse({
        classGroupId: uuid,
        subjectId: uuid,
        term: 1,
        title: "",
      }),
    ).toThrow();
  });

  it("defaults status to draft and components to an empty list", () => {
    const parsed = createLessonPlanInputSchema.parse({
      classGroupId: uuid,
      subjectId: uuid,
      term: 1,
      title: "Fracções",
    });
    expect(parsed.status).toBe("draft");
    expect(parsed.components).toEqual([]);
  });

  it("accepts avaliação/prova components with a planned count", () => {
    const parsed = lessonPlanComponentInputSchema.parse({
      kind: "avaliacao",
      name: "Trabalho de casa",
      plannedCount: 3,
    });
    expect(parsed.plannedCount).toBe(3);
  });

  it("rejects a planned count above the safety cap", () => {
    expect(() =>
      lessonPlanComponentInputSchema.parse({
        kind: "prova",
        name: "Prova de Matemática",
        plannedCount: 21,
      }),
    ).toThrow();
  });

  it("update schema requires the plan id", () => {
    expect(() =>
      updateLessonPlanInputSchema.parse({
        classGroupId: uuid,
        subjectId: uuid,
        term: 1,
        title: "Fracções",
      }),
    ).toThrow();
  });
});
