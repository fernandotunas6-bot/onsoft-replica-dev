import { describe, expect, it } from "vitest";
import { sameScore } from "@/features/academic/assessment-score-write";

describe("auditoria das notas", () => {
  it("nota ausente e zero são diferentes", () => {
    expect(sameScore(null, 0)).toBe(false);
    expect(sameScore(0, null)).toBe(false);
    expect(sameScore(undefined, 0)).toBe(false);
  });

  it("o mesmo valor, venha como número ou como texto da coluna numeric, não é mudança", () => {
    expect(sameScore(12.5, "12.5")).toBe(true);
    expect(sameScore("0", 0)).toBe(true);
    expect(sameScore(null, null)).toBe(true);
    expect(sameScore(12, 13)).toBe(false);
  });
});
