import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/server-error", () => ({ publicDatabaseError: (e: unknown) => e }));

const { PAUTA_COMPONENT_KINDS, pautaComponentKinds } =
  await import("@/features/academic/sga-grades-legacy");
const { calculateTrimesterAverage, parsePautaScore } = await import("@/lib/angola-academic");
const {
  termAverageByRule,
  continuousComponent,
  recoveryResult,
  parseCalculationOptions,
  formulaText,
  DEFAULT_CALCULATION_OPTIONS,
} = await import("@/features/academic/assessment-model");

// Réplica de private.compute_subject_averages: cada item entra na média do
// seu grupo pelo `kind`; o que não está em nenhum grupo não conta.
const CONTINUOUS = ["continuous", "assignment", "test", "recovery"];
const EXAM = ["term_exam", "exam", "resit"];

function officialEngine(
  scores: Record<"MAC" | "NPP" | "NPT", number>,
  weights = { continuous: 50, exam: 50 },
  kinds: Record<string, string> = PAUTA_COMPONENT_KINDS,
) {
  const avg = (bucket: string[]) => {
    const values = (Object.keys(scores) as Array<keyof typeof scores>)
      .filter((code) => bucket.includes(kinds[code]!))
      .map((code) => scores[code]);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const continuous = avg(CONTINUOUS);
  const exam = avg(EXAM);
  const raw = ((continuous ?? 0) * weights.continuous + (exam ?? 0) * weights.exam) / 100;
  return Math.round(raw * 10) / 10;
}

describe("motor oficial da pauta e fórmula do ecrã", () => {
  it("MAC é contínua, NPT é exame e a NPP não conta duas vezes", () => {
    expect(PAUTA_COMPONENT_KINDS).toEqual({
      MAC: "continuous",
      NPP: "informative",
      NPT: "term_exam",
    });
  });

  it.each([
    { MAC: 14, NPP: 10, NPT: 13 },
    { MAC: 14, NPP: 14, NPT: 14 },
    { MAC: 9, NPP: 18, NPT: 11 },
    { MAC: 20, NPP: 0, NPT: 0 },
  ])("dão a mesma média do trimestre (Decreto 424/25): %o", (scores) => {
    expect(officialEngine(scores)).toBe(
      calculateTrimesterAverage(scores.MAC, scores.NPT, scores.NPP),
    );
  });

  it("14 em tudo dá 14, e não metade (o erro de todos os componentes contínuos)", () => {
    expect(officialEngine({ MAC: 14, NPP: 14, NPT: 14 })).toBe(14);
  });

  it.each([
    { weights: { continuous: 50, exam: 50 }, scores: { MAC: 14, NPP: 10, NPT: 13 } },
    { weights: { continuous: 40, exam: 60 }, scores: { MAC: 12, NPP: 15, NPT: 16 } },
    { weights: { continuous: 60, exam: 40 }, scores: { MAC: 9, NPP: 11, NPT: 10 } },
  ])("o ecrã calcula com os pesos do modelo como a pauta oficial: %o", ({ weights, scores }) => {
    const rule = {
      continuousWeight: weights.continuous,
      examWeight: weights.exam,
      roundingMethod: "nearest" as const,
    };
    expect(termAverageByRule(scores.MAC, scores.NPT, rule, 1)).toBe(
      officialEngine(scores, weights),
    );
  });
});

describe("escala das notas", () => {
  it("usa a escala do modelo, com 0–20 só por omissão", () => {
    expect(parsePautaScore("15")).toBe(15);
    expect(parsePautaScore("21")).toBeNaN();
    expect(parsePautaScore("75", { minimum: 0, maximum: 100 })).toBe(75);
    expect(parsePautaScore("4", { minimum: 5, maximum: 20 })).toBeNaN();
    expect(parsePautaScore("")).toBeNull();
  });
});

describe("opções do director no modelo", () => {
  it("sem opções guardadas fica o Decreto 424/25", () => {
    expect(parseCalculationOptions({})).toEqual(DEFAULT_CALCULATION_OPTIONS);
    expect(parseCalculationOptions({ calculation: { nppMode: "x", recoveryMethod: 3 } })).toEqual(
      DEFAULT_CALCULATION_OPTIONS,
    );
    expect(
      parseCalculationOptions({ calculation: { nppMode: "in_continuous", recoveryMethod: "max" } }),
    ).toEqual({ nppMode: "in_continuous", recoveryMethod: "max" });
  });

  it.each([
    { MAC: 14, NPP: 10, NPT: 13 },
    { MAC: 12, NPP: 18, NPT: 9 },
  ])("NPP na parte contínua: o ecrã e o motor oficial dão o mesmo (%o)", (scores) => {
    const rule = { continuousWeight: 50, examWeight: 50, roundingMethod: "nearest" as const };
    const screen = termAverageByRule(
      continuousComponent(scores.MAC, scores.NPP, "in_continuous"),
      scores.NPT,
      rule,
      1,
    );
    expect(screen).toBe(officialEngine(scores, undefined, pautaComponentKinds("in_continuous")));
  });

  it("o recurso segue o método escolhido", () => {
    expect(recoveryResult(8, 12, "average")).toBe(10);
    expect(recoveryResult(8, 12, "replace")).toBe(12);
    expect(recoveryResult(14, 12, "max")).toBe(14);
    expect(recoveryResult(null, 12, "average")).toBe(12);
    expect(recoveryResult(9, null, "replace")).toBe(9);
  });

  it("a fórmula mostrada inclui a NPP quando ela conta", () => {
    const rule = { continuousWeight: 50, examWeight: 50 };
    expect(formulaText(rule)).toBe("MT = (MAC + NPT) ÷ 2");
    expect(
      formulaText({
        ...rule,
        calculation: { nppMode: "in_continuous", recoveryMethod: "average" },
      }),
    ).toBe("MT = ([(MAC + NPP) ÷ 2] + NPT) ÷ 2");
  });
});
