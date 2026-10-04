import { describe, expect, it } from "vitest";
import { isHigherEdOnly, periodModelFor, suggestSemesters } from "@/features/academic/period-model";

describe("modelo de períodos", () => {
  it("só Ensino Superior → semestres; com outros níveis → trimestres", () => {
    expect(periodModelFor(["superior"])).toMatchObject({ kind: "semestre", count: 2 });
    expect(periodModelFor(["ii_ciclo", "superior"])).toMatchObject({ kind: "trimestre", count: 3 });
    expect(periodModelFor([])).toMatchObject({ kind: "trimestre", count: 3 });
    expect(isHigherEdOnly([])).toBe(false);
  });

  it("sugere dois semestres seguidos dentro do ano", () => {
    const [first, second] = suggestSemesters("2026-09-01", "2027-07-31");
    expect(first!.startsOn).toBe("2026-09-01");
    expect(second!.endsOn).toBe("2027-07-31");
    expect(Date.parse(second!.startsOn) - Date.parse(first!.endsOn)).toBe(86_400_000);
  });
});
