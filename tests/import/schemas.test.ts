import { describe, expect, it } from "vitest";
import {
  createImportJobSchema,
  commitImportBatchSchema,
  rollbackImportJobSchema,
  importModuleOptions,
} from "@/features/import/schemas";
import { generateOfficialCsvTemplate, OFFICIAL_TEMPLATES } from "@/features/import/official-templates";

describe("Motor de Importação SIGA — Schemas & Templates", () => {
  it("valida criação de job de importação com módulo válido", () => {
    // school_id nunca vem do cliente — é resolvido no servidor a partir da
    // sessão autenticada (requireSgaWriter), por isso não faz parte do input.
    const valid = createImportJobSchema.parse({
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
        module: "modulo_inexistente" as any,
        file_name: "teste.xlsx",
      }),
    ).toThrow();
  });

  it("valida o schema de commit em lote com valores por omissão seguros", () => {
    const parsed = commitImportBatchSchema.parse({
      job_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(parsed.dry_run).toBe(false);
    expect(parsed.duplicate_strategy).toBe("update");
    expect(parsed.batch_size).toBeGreaterThan(0);
  });

  it("valida o schema de rollback", () => {
    const parsed = rollbackImportJobSchema.parse({
      job_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(parsed.job_id).toBeDefined();
  });

  it("gerador de modelos oficiais CSV produz cabeçalhos e exemplos corretos", () => {
    const csv = generateOfficialCsvTemplate("alunos");
    expect(csv).toContain("Nome Completo");
    expect(csv).toContain("João Manuel António");
  });

  it("possuir especificação para todos os modelos oficiais principais", () => {
    expect(OFFICIAL_TEMPLATES.pessoas).toBeDefined();
    expect(OFFICIAL_TEMPLATES.alunos).toBeDefined();
    expect(OFFICIAL_TEMPLATES.professores).toBeDefined();
    expect(OFFICIAL_TEMPLATES.matriculas).toBeDefined();
    expect(OFFICIAL_TEMPLATES.notas).toBeDefined();
    expect(OFFICIAL_TEMPLATES.pagamentos).toBeDefined();
  });

  it("importModuleOptions inclui todos os módulos do plano de importação", () => {
    expect(importModuleOptions).toContain("pessoas");
    expect(importModuleOptions).toContain("alunos");
    expect(importModuleOptions).toContain("matriculas");
    expect(importModuleOptions.length).toBeGreaterThanOrEqual(20);
  });
});
