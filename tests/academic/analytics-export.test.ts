import { describe, expect, it } from "vitest";
import { termEvolution, yearComparison } from "@/features/academic/academic-analytics";
import { evolutionColumns, levelColumns, yearColumns } from "@/features/academic/analytics-export";

const cells = <Row>(columns: { label: string; value: (r: Row) => unknown }[], row: Row) =>
  columns.map((c) => c.value(row));

describe("exportação dos painéis de análise", () => {
  it("evolução: mesmos valores do ecrã, com tendência e traço onde falta", () => {
    const [row] = termEvolution(
      [
        { groupId: "a", groupName: "10ª A", term: 1, average: 12 },
        { groupId: "a", groupName: "10ª A", term: 2, average: 10.5 },
      ],
      10,
    );
    const columns = evolutionColumns("turma");
    expect(columns.map((c) => c.label)).toEqual([
      "Turma",
      "1.º período",
      "2.º período",
      "3.º período",
      "Variação",
      "Tendência",
      "Negativas (último)",
    ]);
    expect(cells(columns, row)).toEqual(["10ª A", 12, 10.5, "—", -1.5, "a descer", "0%"]);
    expect(evolutionColumns("disciplina")[0].label).toBe("Disciplina");
  });

  it("anos e classes", () => {
    const data = yearComparison(
      [
        { yearLabel: "2023", gradeLevel: "7ª", finalAverage: 12, outcome: "Transitou" },
        { yearLabel: "2024", gradeLevel: "7ª", finalAverage: 9, outcome: "Não transitou" },
        { yearLabel: "2024", gradeLevel: "7ª", finalAverage: 13, outcome: "Transitou" },
      ],
      ["2023", "2024"],
    );
    expect(cells(yearColumns, data.years[0])).toEqual(["2023", 1, 12, "100%", "0%", "—"]);
    expect(cells(yearColumns, data.years[1])).toEqual(["2024", 2, 11, "50%", "50%", -50]);
    const columns = levelColumns(["2023", "2024"]);
    expect(columns.map((c) => c.label)).toEqual(["Classe", "Transitaram 2023", "Transitaram 2024"]);
    expect(cells(columns, data.levels[0])).toEqual(["7ª", "100%", "50%"]);
  });
});
