import { describe, expect, it } from "vitest";
import {
  createImportJobSchema,
  commitImportJobSchema,
  rollbackImportJobSchema,
  importModuleOptions,
} from "@/features/import/schemas";
import { generateOfficialCsvTemplate, OFFICIAL_TEMPLATES } from "@/features/import/official-templates";

describe("Motor de Importação SIGA — Schemas & Templates", () => {
  it("valida criação de job de importação com módulo válido", () => {
    const valid = createImportJobSchema.parse({
      school_id: "123e4567-e89b-12d3-a456-426614174000",
      module: "alunos",
      file_name: "Alunos_2026.xlsx",
      total_rows: 150,
    });
    expect(valid.module).toBe("alunos");
    expect(valid.total_rows).toBe(150);
  });

  it("rejeita módulos inválidos no schema de jobs", () => {
    expect(() =>
      createImportJobSchema.parse({
        school_id: "123e4567-e89b-12d3-a456-426614174000",
        module: "modulo_inexistente" as any,
        file_name: "teste.xlsx",
      })
    ).toThrow();
  });

  it("gerador de modelos oficiais CSV produz cabeçalhos e exemplos corretos", () => {
    const csv = generateOfficialCsvTemplate("alunos");
    expect(csv).toContain("Nome Completo");
    expect(csv).toContain("João Manuel António");
  });

  it("possuir especificação para todos os modelos oficiais principais", () => {
    expect(OFFICIAL_TEMPLATES.alunos).toBeDefined();
    expect(OFFICIAL_TEMPLATES.professores).toBeDefined();
    expect(OFFICIAL_TEMPLATES.matriculas).toBeDefined();
    expect(OFFICIAL_TEMPLATES.notas).toBeDefined();
    expect(OFFICIAL_TEMPLATES.pagamentos).toBeDefined();
  });
});
