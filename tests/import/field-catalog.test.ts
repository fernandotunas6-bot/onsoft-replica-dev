import { describe, it, expect } from "vitest";
import { FIELD_CATALOG, findCatalogMatch } from "@/features/import/engine/field-catalog";
import { suggestColumnMapping, suggestModule } from "@/features/import/engine/suggest";

describe("SIGA Data Import Engine — Field Catalog & Alias Matcher", () => {
  it("deve carregar o catálogo mestre de módulos centrais", () => {
    expect(FIELD_CATALOG.pessoas).toBeDefined();
    expect(FIELD_CATALOG.alunos).toBeDefined();
    expect(FIELD_CATALOG.professores).toBeDefined();
    expect(FIELD_CATALOG.turmas).toBeDefined();
    expect(FIELD_CATALOG.matriculas).toBeDefined();
    expect(FIELD_CATALOG.notas).toBeDefined();
  });

  it("deve reconhecer múltiplos sinônimos e variações de 'Nome do Aluno'", () => {
    const catalog = FIELD_CATALOG.alunos;
    const variations = [
      "Nome",
      "Nome Completo",
      "Nome do Aluno",
      "Nome do Estudante",
      "Aluno",
      "Estudante",
      "STUDENT NAME",
      "nome_aluno",
    ];

    for (const v of variations) {
      const match = findCatalogMatch(v, catalog);
      expect(match, `Falhou para a variação: ${v}`).not.toBeNull();
      expect(match?.field.key).toBe("full_name");
      expect(match?.confidence).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("deve reconhecer identificadores de processo e bilhete de identidade", () => {
    const catalog = FIELD_CATALOG.alunos;

    const processMatch = findCatalogMatch("Nº de Processo", catalog);
    expect(processMatch?.field.key).toBe("student_number");

    const biMatch = findCatalogMatch("Bilhete de Identidade", catalog);
    expect(biMatch?.field.key).toBe("id_number");

    const altBiMatch = findCatalogMatch("B.I.", catalog);
    expect(altBiMatch?.field.key).toBe("id_number");
  });

  it("deve reconhecer cabeçalhos de notas e provas na escala angolana", () => {
    const catalog = FIELD_CATALOG.notas;

    expect(findCatalogMatch("MAC", catalog)?.field.key).toBe("mac");
    expect(findCatalogMatch("Avaliação Contínua", catalog)?.field.key).toBe("mac");
    expect(findCatalogMatch("NPP", catalog)?.field.key).toBe("npp");
    expect(findCatalogMatch("Prova do Professor", catalog)?.field.key).toBe("npp");
    expect(findCatalogMatch("NPT", catalog)?.field.key).toBe("npt");
    expect(findCatalogMatch("Prova Trimestral", catalog)?.field.key).toBe("npt");
  });

  it("deve sugerir módulo 'alunos' para planilhas com aluno, turma e encarregado", () => {
    const headers = [
      "Nome do Aluno",
      "Nº de Processo",
      "Turma",
      "Encarregado de Educação",
      "Data de Nascimento",
    ];
    const suggestion = suggestModule(headers);
    expect(suggestion.module).toBe("alunos");
    expect(suggestion.score).toBeGreaterThan(0.5);
  });

  it("deve mapear colunas desconhecidas como 'ignore' sem quebrar", () => {
    const headers = ["Nome do Aluno", "Coluna_Totalmente_Aleatoria_XYZ"];
    const mapping = suggestColumnMapping(headers, "alunos");
    expect(mapping["Nome do Aluno"]).toBe("full_name");
    expect(mapping["Coluna_Totalmente_Aleatoria_XYZ"]).toBe("ignore");
  });
});
