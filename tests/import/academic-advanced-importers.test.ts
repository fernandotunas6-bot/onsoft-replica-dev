import { describe, it, expect } from "vitest";
import { presencasImporter } from "@/features/import/importers/presencas-importer";
import { pautasImporter } from "@/features/import/importers/pautas-importer";
import { propinasImporter } from "@/features/import/importers/propinas-importer";

describe("Academic Advanced Importers (presencas, pautas, propinas)", () => {
  describe("presencasImporter", () => {
    it("valida campos obrigatórios (aluno e assiduidade)", () => {
      const cache = { students: [], enrollmentByStudentId: new Map() };
      const analysis = presencasImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
      expect(analysis.errors).toContain("Taxa de assiduidade ou percentagem de presenças é obrigatória.");
    });

    it("rejeita taxa inválida fora de 0-100", () => {
      const cache = { students: [], enrollmentByStudentId: new Map() };
      const analysis = presencasImporter.analyzeRow(
        { student_identifier: "PROC-1", attendance_rate: 150 },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Taxa de assiduidade deve ser uma percentagem válida entre 0 e 100.");
    });

    it("reconhece taxa de assiduidade válida", () => {
      const cache = {
        students: [
          { id: "s1", student_number: "PROC-042", national_id: "001234LA042", status: "active", person_id: "p1" },
        ],
        enrollmentByStudentId: new Map([["s1", { id: "e1", student_id: "s1", attendance_rate: 90 }]]),
      };
      const analysis = presencasImporter.analyzeRow(
        { student_identifier: "PROC-042", attendance_rate: "95%" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });

  describe("pautasImporter", () => {
    it("valida campos obrigatórios (aluno e média)", () => {
      const cache = { students: [], enrollmentByStudentId: new Map() };
      const analysis = pautasImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
      expect(analysis.errors).toContain("Média final da pauta é obrigatória.");
    });

    it("rejeita nota fora da escala de 0 a 20", () => {
      const cache = { students: [], enrollmentByStudentId: new Map() };
      const analysis = pautasImporter.analyzeRow(
        { student_identifier: "PROC-1", final_average: 25 },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Média final deve estar na escala angolana de 0 a 20 valores.");
    });

    it("reconhece pauta anual válida", () => {
      const cache = {
        students: [
          { id: "s1", student_number: "PROC-042", national_id: "001234LA042", status: "active", person_id: "p1" },
        ],
        enrollmentByStudentId: new Map([["s1", { id: "e1", student_id: "s1", final_average: null }]]),
      };
      const analysis = pautasImporter.analyzeRow(
        { student_identifier: "PROC-042", final_average: "15,5" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });

  describe("propinasImporter", () => {
    it("rejeita dia de vencimento inválido", () => {
      const cache = { existingSettingsId: null };
      const analysis = propinasImporter.analyzeRow(
        { due_day: 35 },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Dia de vencimento deve ser entre 1 e 31.");
    });

    it("reconhece parâmetros válidos de propinas", () => {
      const cache = { existingSettingsId: null };
      const analysis = propinasImporter.analyzeRow(
        { due_day: 10, late_fee_percent: 10, grace_days: 5 },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });
});
