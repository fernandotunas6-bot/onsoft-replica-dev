import { describe, expect, it } from "vitest";
import { roundGrade as modelRound } from "@/features/academic/assessment-model";
import { roundGrade as pautaRound } from "@/features/pedagogica/components/pautas/assessment";
import { calculateTrimesterAverage, roundHalfUp } from "@/lib/angola-academic";

/**
 * Auditoria 14: três arredondamentos de notas davam resultados diferentes em 1 022 de
 * 40 401 pares — a mesma média saía 2,4 no modelo e 2,3 na pauta.
 */
describe("uma só regra de arredondamento de notas", () => {
  it("meio para cima sobre o valor decimal", () => {
    expect(roundHalfUp((0.1 + 4.6) / 2, 1)).toBe(2.4);
    expect(roundHalfUp((9.8 + 10.1) / 2, 1)).toBe(10);
    expect(roundHalfUp(9.94, 1)).toBe(9.9);
  });

  it("modelo, pauta e média do trimestre dão sempre o mesmo", () => {
    for (let a = 0; a <= 200; a += 1) {
      for (let b = 0; b <= 200; b += 1) {
        const value = (a / 10 + b / 10) / 2;
        const expected = modelRound(value, "nearest", 1);
        expect(pautaRound(value, 1)).toBe(expected);
        expect(calculateTrimesterAverage(a / 10, b / 10)).toBe(expected);
      }
    }
  });
});
