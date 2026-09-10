import { describe, it, expect } from "vitest";
import { IMPORTER_REGISTRY, getImporter } from "@/features/import/engine/registry";
import { importModuleOptions, IMPLEMENTED_IMPORT_MODULES } from "@/features/import/schemas";
import { inscricoesImporter } from "@/features/import/importers/inscricoes-importer";
import { avaliacoesImporter } from "@/features/import/importers/avaliacoes-importer";
import { historicoAcademicoImporter } from "@/features/import/importers/historico-academico-importer";
import { historicoFinanceiroImporter } from "@/features/import/importers/historico-financeiro-importer";

describe("All 22 Importers Completeness & Coverage", () => {
  it("contém exatamente todos os 22 módulos registados no IMPORTER_REGISTRY", () => {
    expect(importModuleOptions).toHaveLength(22);
    expect(IMPLEMENTED_IMPORT_MODULES).toHaveLength(22);

    for (const mod of importModuleOptions) {
      const importer = getImporter(mod);
      expect(importer).toBeDefined();
      expect(importer.module).toBe(mod);
      expect(typeof importer.loadRefCache).toBe("function");
      expect(typeof importer.analyzeRow).toBe("function");
      expect(typeof importer.commitRow).toBe("function");
    }
  });

  describe("inscricoesImporter", () => {
    it("exige nome do candidato", () => {
      const cache = { existingApplicantNumbers: new Set() };
      const res = inscricoesImporter.analyzeRow({}, cache as any);
      expect(res.status).toBe("error");
      expect(res.errors).toContain("Nome completo do candidato é obrigatório.");
    });

    it("valida candidato correcto", () => {
      const cache = { existingApplicantNumbers: new Set() };
      const res = inscricoesImporter.analyzeRow(
        { full_name: "Benedito Calei", application_number: "CAND-001" },
        cache as any,
      );
      expect(res.status).toBe("valid");
    });
  });

  describe("avaliacoesImporter", () => {
    it("valida obrigatoriedade de nome e código", () => {
      const res = avaliacoesImporter.analyzeRow({}, {} as any);
      expect(res.status).toBe("error");
      expect(res.errors).toContain("Designação ou nome da avaliação é obrigatório.");
      expect(res.errors).toContain(
        "Código ou sigla da avaliação é obrigatório (ex: MAC, NPP, NPT, P1).",
      );
    });

    it("valida avaliação correcta", () => {
      const res = avaliacoesImporter.analyzeRow(
        { assessment_name: "Prova do 1º Trimestre", code: "P1", max_score: 20 },
        {} as any,
      );
      expect(res.status).toBe("valid");
    });
  });

  describe("historicoAcademicoImporter", () => {
    it("valida dados escolares históricos", () => {
      const cache = {
        students: [
          {
            id: "s1",
            student_number: "PROC-1",
            national_id: "0012LA",
            status: "active",
            person_id: "p1",
          },
        ],
        existingKeys: new Set(),
      };
      const res = historicoAcademicoImporter.analyzeRow(
        { student_identifier: "PROC-1", academic_year: "2023/2024", grade_level: "8ª Classe" },
        cache as any,
      );
      expect(res.status).toBe("valid");
    });

    it("avisa quando o histórico já existe (idempotência)", () => {
      const cache = {
        students: [
          {
            id: "s1",
            student_number: "PROC-1",
            national_id: "0012LA",
            status: "active",
            person_id: "p1",
          },
        ],
        existingKeys: new Set(["s1::2023/2024::8ª Classe"]),
      };
      const res = historicoAcademicoImporter.analyzeRow(
        { student_identifier: "PROC-1", academic_year: "2023/2024", grade_level: "8ª Classe" },
        cache as any,
      );
      expect(res.status).toBe("warning");
      expect(res.warnings[0]).toMatch(/já existe/i);
    });
  });

  describe("historicoFinanceiroImporter", () => {
    it("valida valor financeiro e aluno", () => {
      const cache = {
        students: [
          {
            id: "s1",
            student_number: "PROC-1",
            national_id: "0012LA",
            status: "active",
            person_id: "p1",
          },
        ],
        existingInvoices: new Set(),
      };
      const res = historicoFinanceiroImporter.analyzeRow(
        { student_identifier: "PROC-1", amount: 45000, invoice_number: "FT-2023-001" },
        cache as any,
      );
      expect(res.status).toBe("valid");
    });
  });
});
