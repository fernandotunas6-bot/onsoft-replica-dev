import { describe, expect, it } from "vitest";
import { turmasImporter } from "@/features/import/importers/turmas-importer";

const cache = {
  existingPeople: [],
  classGroups: [],
  studentByPersonId: new Map(),
  academicYearId: "ano-1",
  gradeLevels: [
    { id: "g10", code: "10", name: "10ª Classe" },
    { id: "g11", code: "11", name: "11ª Classe" },
  ],
  campuses: [],
  existingGroups: [],
};

describe("Importar turmas — classe", () => {
  it("associa «10a classe» à 10ª Classe e avisa", () => {
    const analysis = turmasImporter.analyzeRow(
      { code: "10A", name: "10ª A", classe: "10a classe", turno: "Manhã" },
      cache as never,
    );
    expect(analysis.status).toBe("warning");
    expect(analysis.warnings.join(" ")).toContain("associada a «10ª Classe» (10)");
  });

  it("não inventa uma classe que a escola não tem", () => {
    const analysis = turmasImporter.analyzeRow(
      { code: "12A", name: "12ª A", classe: "décima segunda classe", turno: "Manhã" },
      cache as never,
    );
    expect(analysis.status).toBe("error");
    expect(analysis.errors.join(" ")).toContain("não encontrada nesta escola");
  });
});
