import { describe, expect, it } from "vitest";
import {
  updateAssessmentInputSchema,
  deleteAssessmentInputSchema,
} from "@/features/academic/schemas";

describe("Academic Assessment CRUD Schemas", () => {
  it("validates updateAssessmentInputSchema correctly", () => {
    const valid = updateAssessmentInputSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Prova Trimestral de Física",
      kind: "prova",
      component: "NPP",
      maxScore: 20,
      countsTowardPauta: true,
      allowRecovery: true,
    });

    expect(valid.id).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(valid.name).toBe("Prova Trimestral de Física");
    expect(valid.component).toBe("NPP");
  });

  it("validates deleteAssessmentInputSchema correctly", () => {
    const valid = deleteAssessmentInputSchema.parse({
      itemId: "123e4567-e89b-12d3-a456-426614174000",
      force: true,
    });

    expect(valid.itemId).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(valid.force).toBe(true);
  });
});
