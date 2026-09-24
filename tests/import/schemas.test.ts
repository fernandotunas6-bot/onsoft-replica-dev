import { describe, expect, it } from "vitest";
import {
  createImportJobSchema,
  commitImportBatchSchema,
  rollbackImportJobSchema,
  importModuleOptions,
} from "@/features/import/schemas";
import {
  generateOfficialCsvTemplate,
  OFFICIAL_TEMPLATES,
} from "@/features/import/official-templates";

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
        module: "modulo_inexistente",
        file_name: "teste.xlsx",
      } as unknown as Record<string, unknown>),
    ).toThrow();
  });

  it("valida o contrato premium de job: modo, formato, idempotência e manifesto", () => {
    const parsed = createImportJobSchema.parse({
      module: "alunos",
      file_name: "Alunos_2026.xlsx",
      exchange_mode: "siga_exchange",
      source_format: "xlsx",
      dry_run: true,
      idempotency_key: "escola-demo:alunos:2026:sha256:abc123",
      manifest: { version: "1.0", source: "SIGA" },
      dependency_plan: ["pessoas", "alunos", "matriculas"],
    });
    expect(parsed.exchange_mode).toBe("siga_exchange");
    expect(parsed.source_format).toBe("xlsx");
    expect(parsed.dry_run).toBe(true);
    expect(parsed.idempotency_key).toContain("sha256");
    expect(parsed.manifest.version).toBe("1.0");
    expect(parsed.dependency_plan).toHaveLength(3);
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

  it("possuir especificação para todos os 22 modelos oficiais do SIGA", () => {
    for (const mod of importModuleOptions) {
      expect(
        OFFICIAL_TEMPLATES[mod],
        `Modelo oficial para "${mod}" deve estar definido`,
      ).toBeDefined();
      expect(OFFICIAL_TEMPLATES[mod].columns.length).toBeGreaterThan(0);
      expect(OFFICIAL_TEMPLATES[mod].label).toBeTruthy();
      expect(OFFICIAL_TEMPLATES[mod].category).toBeTruthy();

      const csv = generateOfficialCsvTemplate(mod);
      expect(csv).toBeTruthy();
      // Não pode cair no fallback genérico
      expect(csv).not.toContain("Exemplo Silva;000000000LA000;923112233");

      // Deve possuir cabeçalho + pelo menos 3 linhas de demonstração práticas
      const lines = csv.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("importModuleOptions inclui todos os 22 módulos do plano de importação", () => {
    expect(importModuleOptions).toHaveLength(22);
    expect(importModuleOptions).toContain("pessoas");
    expect(importModuleOptions).toContain("alunos");
    expect(importModuleOptions).toContain("encarregados");
    expect(importModuleOptions).toContain("professores");
    expect(importModuleOptions).toContain("funcionarios");
    expect(importModuleOptions).toContain("turmas");
    expect(importModuleOptions).toContain("classes");
    expect(importModuleOptions).toContain("cursos");
    expect(importModuleOptions).toContain("disciplinas");
    expect(importModuleOptions).toContain("salas");
    expect(importModuleOptions).toContain("matriculas");
    expect(importModuleOptions).toContain("inscricoes");
    expect(importModuleOptions).toContain("horarios");
    expect(importModuleOptions).toContain("notas");
    expect(importModuleOptions).toContain("avaliacoes");
    expect(importModuleOptions).toContain("pautas");
    expect(importModuleOptions).toContain("presencas");
    expect(importModuleOptions).toContain("propinas");
    expect(importModuleOptions).toContain("pagamentos");
    expect(importModuleOptions).toContain("dividas");
    expect(importModuleOptions).toContain("historico_academico");
    expect(importModuleOptions).toContain("historico_financeiro");
  });
});
