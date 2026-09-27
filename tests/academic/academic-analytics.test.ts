import { describe, expect, it } from "vitest";
import { termEvolution } from "@/features/academic/academic-analytics";

const g = (groupId: string, term: number, average: number) => ({
  groupId,
  groupName: groupId.toUpperCase(),
  term,
  average,
});

describe("evolução entre períodos", () => {
  const rows = termEvolution(
    [
      // A: 14 → 11 (desce 3); 50% negativas no 2.º (11 e 9).
      g("a", 1, 14),
      g("a", 1, 14),
      g("a", 2, 13),
      g("a", 2, 9),
      // B: 10 → 12 (sobe 2).
      g("b", 1, 10),
      g("b", 2, 12),
      // C: 12 → 12.3 (estável).
      g("c", 1, 12),
      g("c", 2, 12.3),
      // D: só um período — sem comparação.
      g("d", 1, 8),
    ],
    10,
  );

  it("média e negativas por período", () => {
    const a = rows.find((r) => r.id === "a")!;
    expect(a.terms.map((t) => t.average)).toEqual([14, 11, null]);
    expect(a.terms[1].negativesPct).toBe(50);
    expect(a.latestNegativesPct).toBe(50);
  });

  it("variação e tendência entre os dois últimos períodos com notas", () => {
    const by = Object.fromEntries(rows.map((r) => [r.id, [r.delta, r.trend]]));
    expect(by).toEqual({
      a: [-3, "a descer"],
      b: [2, "a subir"],
      c: [0.3, "estável"],
      d: [null, null],
    });
  });

  it("as que mais desceram primeiro; sem comparação no fim", () => {
    expect(rows.map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("usa a nota de aprovação passada (do modelo)", () => {
    const strict = termEvolution([g("x", 1, 11), g("x", 1, 13)], 12);
    expect(strict[0].terms[0].negativesPct).toBe(50);
  });
});
