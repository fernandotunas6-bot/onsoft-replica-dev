import { describe, expect, it } from "vitest";
import { outcomeKind, termEvolution, yearComparison } from "@/features/academic/academic-analytics";

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

describe("outcomeKind", () => {
  it("reconhece a negação antes de 'transit'", () => {
    expect(outcomeKind("Não transitou")).toBe("fail");
    expect(outcomeKind("NAO TRANSITOU")).toBe("fail");
    expect(outcomeKind("Transitou")).toBe("pass");
    expect(outcomeKind("Aprovado")).toBe("pass");
    expect(outcomeKind("Reprovado")).toBe("fail");
    expect(outcomeKind("Incompleto")).toBe("other");
    expect(outcomeKind(null)).toBe("other");
  });
});

describe("yearComparison", () => {
  const rec = (
    yearLabel: string,
    gradeLevel: string,
    finalAverage: number | null,
    outcome: string,
  ) => ({
    yearLabel,
    gradeLevel,
    finalAverage,
    outcome,
  });

  it("resume por ano na ordem dada e calcula a variação da transição", () => {
    const result = yearComparison(
      [
        rec("2024/2025", "10ª", 12, "Transitou"),
        rec("2024/2025", "10ª", 8, "Não transitou"),
        rec("2023/2024", "10ª", 14, "Transitou"),
        rec("2023/2024", "11ª", 11, "Transitou"),
        rec("2023/2024", "11ª", null, "Incompleto"),
      ],
      ["2023/2024", "2024/2025"],
    );
    expect(result.years.map((y) => y.yearLabel)).toEqual(["2023/2024", "2024/2025"]);
    const [first, second] = result.years;
    expect(first).toMatchObject({
      students: 3,
      average: 12.5,
      passPct: 100,
      failPct: 0,
      passDelta: null,
    });
    expect(second).toMatchObject({
      students: 2,
      average: 10,
      passPct: 50,
      failPct: 50,
      passDelta: -50,
    });
    expect(result.levels).toEqual([
      { gradeLevel: "10ª", byYear: { "2023/2024": 100, "2024/2025": 50 } },
      { gradeLevel: "11ª", byYear: { "2023/2024": 100, "2024/2025": null } },
    ]);
  });

  it("anos sem ordem conhecida vão no fim, por nome", () => {
    const result = yearComparison(
      [
        rec("2022", "7ª", 10, "Transitou"),
        rec("2019", "7ª", 10, "Transitou"),
        rec("2021", "7ª", 10, "Transitou"),
      ],
      ["2021"],
    );
    expect(result.years.map((y) => y.yearLabel)).toEqual(["2021", "2019", "2022"]);
  });

  it("sem situação decidida não inventa percentagens", () => {
    const result = yearComparison([rec("2025", "1ª", null, "Incompleto")]);
    expect(result.years[0]).toMatchObject({
      students: 1,
      average: null,
      passPct: null,
      failPct: null,
    });
  });
});
