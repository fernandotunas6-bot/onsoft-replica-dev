import { describe, it, expect } from "vitest";
import { cursosImporter } from "@/features/import/importers/cursos-importer";
import { OFFICIAL_TEMPLATES } from "@/features/import/official-templates";
import { FIELD_CATALOG } from "@/features/import/engine/field-catalog";

/**
 * `programs.academic_level_id` é NOT NULL e, até 2026-09-16, a folha de cursos não tinha
 * nenhuma coluna capaz de o exprimir: o importador adivinhava a partir de "Habilitação / Grau".
 * Escolas com mais do que um nível configurado não tinham como importar cursos.
 */

const doisNiveis = [
  { id: "al1", code: "PRI", name: "Ensino Primário" },
  { id: "al2", code: "SEC", name: "Ensino Secundário" },
];

function cache(academicLevels: typeof doisNiveis) {
  return { existingCourses: [], academicLevels };
}

describe("o modelo de cursos expõe o nível académico", () => {
  it("a coluna existe no modelo oficial descarregável", () => {
    const keys = OFFICIAL_TEMPLATES.cursos.columns.map((c) => c.key);
    expect(keys).toContain("academic_level");
  });

  it("a coluna existe no catálogo de sugestão automática", () => {
    const keys = FIELD_CATALOG.cursos.fields.map((f) => f.key);
    expect(keys).toContain("academic_level");
  });
});

describe("cursosImporter resolve o nível académico", () => {
  it("usa a coluna dedicada quando está preenchida", () => {
    const res = cursosImporter.analyzeRow(
      { code: "CFB", name: "Ciências Físicas", academic_level: "Ensino Secundário" },
      cache(doisNiveis) as never,
    );
    expect(res.status).toBe("valid");
  });

  it("aceita o código do nível, não só o nome", () => {
    const res = cursosImporter.analyzeRow(
      { code: "CFB", name: "Ciências Físicas", academic_level: "SEC" },
      cache(doisNiveis) as never,
    );
    expect(res.status).toBe("valid");
  });

  it("recusa um nível que a escola não tem, em vez de escolher outro", () => {
    const res = cursosImporter.analyzeRow(
      { code: "CFB", name: "Ciências Físicas", academic_level: "Ensino Universitário" },
      cache(doisNiveis) as never,
    );
    expect(res.status).toBe("error");
    expect(res.errors[0]).toMatch(/Ensino Primário, Ensino Secundário/);
  });

  it("sem coluna preenchida e com vários níveis, reprova em vez de adivinhar", () => {
    const res = cursosImporter.analyzeRow(
      { code: "CFB", name: "Ciências Físicas" },
      cache(doisNiveis) as never,
    );
    expect(res.status).toBe("error");
  });

  it("sem coluna preenchida mas com um único nível, usa esse", () => {
    const res = cursosImporter.analyzeRow(
      { code: "CFB", name: "Ciências Físicas" },
      cache([doisNiveis[1]!]) as never,
    );
    expect(res.status).toBe("valid");
  });

  it("continua a aceitar folhas antigas que só têm Habilitação / Grau", () => {
    const res = cursosImporter.analyzeRow(
      { code: "CFB", name: "Ciências Físicas", degree: "Ensino Secundário" },
      cache(doisNiveis) as never,
    );
    expect(res.status).toBe("valid");
  });
});
