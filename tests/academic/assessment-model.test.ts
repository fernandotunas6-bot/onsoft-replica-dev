import { describe, expect, it } from "vitest";
import {
  DECREE_424_25_MODEL,
  draftFromRule,
  formulaText,
  roundGrade,
  ruleChanges,
  termAverageByRule,
  validateRuleDraft,
  type AssessmentRuleDraft,
} from "@/features/academic/assessment-model";

const scale = { minimum: 0, maximum: 20, decimalPlaces: 0 };
const decree: AssessmentRuleDraft = { ...DECREE_424_25_MODEL, maximumAbsencePercentage: 33 };

describe("modelo de avaliação", () => {
  it("o modelo por omissão é o do Decreto 424/25 e não inventa o limite de faltas", () => {
    const draft = draftFromRule(null);
    expect(draft.continuousWeight).toBe(50);
    expect(draft.examWeight).toBe(50);
    expect(draft.passingValue).toBe(10);
    expect(draft.maximumAbsencePercentage).toBeNull();
    expect(validateRuleDraft(draft, scale).map((i) => i.field)).toEqual([
      "maximumAbsencePercentage",
    ]);
  });

  it("valida pesos, escala e faltas como a base", () => {
    expect(validateRuleDraft(decree, scale)).toEqual([]);
    expect(validateRuleDraft({ ...decree, examWeight: 40 }, scale)[0].message).toMatch(/somar 100/);
    expect(validateRuleDraft({ ...decree, passingValue: 25 }, scale)[0].message).toMatch(/0 e 20/);
    expect(validateRuleDraft({ ...decree, maximumAbsencePercentage: 120 }, scale)).toHaveLength(1);
    expect(validateRuleDraft(decree, null)[0].message).toMatch(/escala/);
  });

  it("arredonda como private.round_grade", () => {
    expect(roundGrade(10.5, "nearest", 0)).toBe(11);
    expect(roundGrade(9.1, "up", 0)).toBe(10);
    expect(roundGrade(9.9, "down", 0)).toBe(9);
    expect(roundGrade(9.95, "none", 0)).toBe(9.95);
    expect(roundGrade(9.94, "nearest", 1)).toBe(9.9);
  });

  it("calcula a média do período pelos pesos da regra", () => {
    expect(termAverageByRule(12, 9, decree, 0)).toBe(11);
    expect(termAverageByRule(12, 9, { ...decree, continuousWeight: 40, examWeight: 60 }, 1)).toBe(
      10.2,
    );
    expect(formulaText(decree)).toBe("MT = (MAC + NPT) ÷ 2");
    expect(formulaText({ continuousWeight: 40, examWeight: 60 })).toBe(
      "MT = MAC × 40% + NPT × 60%",
    );
  });

  it("lista só o que muda entre versões", () => {
    expect(ruleChanges(decree, decree)).toEqual([]);
    const next = { ...decree, passingValue: 9.5, keySubjectIds: ["a"] };
    expect(ruleChanges(decree, next).map((c) => c.label)).toEqual([
      "Aprovação",
      "Disciplinas-chave",
    ]);
    const swapped = { ...next, keySubjectIds: ["b"] };
    expect(ruleChanges(next, swapped).map((c) => c.label)).toEqual(["Disciplinas-chave"]);
    expect(ruleChanges(null, decree)).toEqual([]);
  });
});
