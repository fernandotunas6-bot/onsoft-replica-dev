import { describe, expect, it } from "vitest";
import {
  createAssessmentInputSchema,
  updateAssessmentInputSchema,
} from "@/features/academic/schemas";

const base = {
  classGroupId: "00000000-0000-4000-8000-000000000001",
  subjectId: "00000000-0000-4000-8000-000000000002",
  term: 1 as const,
  name: "Teste 1",
};

describe("cadastro da avaliação: hora, duração e finalidade", () => {
  it("aceita os três campos opcionais", () => {
    const parsed = createAssessmentInputSchema.parse({
      ...base,
      startsAt: "08:30",
      durationMinutes: 90,
      purpose: "summative",
    });
    expect(parsed).toMatchObject({ startsAt: "08:30", durationMinutes: 90, purpose: "summative" });
    expect(createAssessmentInputSchema.parse(base).purpose).toBeUndefined();
  });

  it("recusa hora, duração e finalidade inválidas", () => {
    for (const extra of [
      { startsAt: "25:00" },
      { durationMinutes: 2 },
      { durationMinutes: 601 },
      { purpose: "outra" },
    ]) {
      expect(createAssessmentInputSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
    expect(
      updateAssessmentInputSchema.safeParse({
        id: base.classGroupId,
        name: "x1",
        kind: "teste",
        component: "NPP",
        durationMinutes: 45,
      }).success,
    ).toBe(true);
  });
});
