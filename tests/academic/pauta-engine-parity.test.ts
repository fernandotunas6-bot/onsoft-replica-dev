import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/server-error", () => ({ publicDatabaseError: (e: unknown) => e }));

const { PAUTA_COMPONENT_KINDS } = await import("@/features/academic/sga-grades-legacy");
const { calculateTrimesterAverage } = await import("@/lib/angola-academic");

// Réplica de private.compute_subject_averages: cada item entra na média do
// seu grupo pelo `kind`; o que não está em nenhum grupo não conta.
const CONTINUOUS = ["continuous", "assignment", "test", "recovery"];
const EXAM = ["term_exam", "exam", "resit"];

function officialEngine(
  scores: Record<"MAC" | "NPP" | "NPT", number>,
  weights = { continuous: 50, exam: 50 },
) {
  const avg = (kinds: string[]) => {
    const values = (Object.keys(scores) as Array<keyof typeof scores>)
      .filter((code) => kinds.includes(PAUTA_COMPONENT_KINDS[code]))
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
});
