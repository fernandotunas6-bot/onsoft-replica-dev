import { describe, it, expect } from "vitest";
import { presencasImporter } from "@/features/import/importers/presencas-importer";
import { pautasImporter } from "@/features/import/importers/pautas-importer";
import { propinasImporter } from "@/features/import/importers/propinas-importer";

describe("Academic Advanced Importers (presencas, pautas, propinas)", () => {
  describe("presencasImporter", () => {
    it("valida os campos obrigatórios de uma presença por sessão", () => {
      const cache = { academicYearId: "ay1", students: [], groups: [], subjects: [] };
      const analysis = presencasImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Identificador do aluno é obrigatório.");
      expect(analysis.errors).toContain("Turma é obrigatória para registar a presença.");
      expect(analysis.errors).toContain("Disciplina é obrigatória para registar a presença.");
      expect(analysis.errors).toContain("Data da presença é obrigatória e deve ser válida.");
      expect(analysis.errors).toContain(
        "Estado de presença inválido. Use presente, ausente, justificada, atrasado ou saída antecipada.",
      );
    });

    it("rejeita um estado de presença desconhecido", () => {
      const cache = { academicYearId: "ay1", students: [], groups: [], subjects: [] };
      const analysis = presencasImporter.analyzeRow(
        {
          student_identifier: "PROC-1",
          class_group: "10A",
          subject: "MAT",
          attendance_date: "2026-09-24",
          status: "talvez",
        },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain(
        "Estado de presença inválido. Use presente, ausente, justificada, atrasado ou saída antecipada.",
      );
    });

    it("reconhece uma presença por aluno, turma, disciplina e data", () => {
      const cache = {
        academicYearId: "ay1",
        students: [
          {
            id: "s1",
            student_number: "PROC-042",
            national_id: "001234LA042",
            status: "active",
            person_id: "p1",
          },
        ],
        groups: [{ id: "g1", code: "10A", name: "10ª Classe A", academic_year_id: "ay1" }],
        subjects: [{ id: "sub1", code: "MAT", name: "Matemática" }],
      };
      const analysis = presencasImporter.analyzeRow(
        {
          student_identifier: "PROC-042",
          class_group: "10A",
          subject: "MAT",
          attendance_date: "2026-09-24",
          status: "presente",
        },
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
      expect(analysis.errors).toContain(
        "Identificador do aluno (Nº Processo ou BI) é obrigatório.",
      );
      expect(analysis.errors).toContain("Média final da pauta é obrigatória.");
    });

    it("rejeita nota fora da escala de 0 a 20", () => {
      const cache = { students: [], enrollmentByStudentId: new Map() };
      const analysis = pautasImporter.analyzeRow(
        { student_identifier: "PROC-1", final_average: 25 },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain(
        "Média final deve estar na escala angolana de 0 a 20 valores.",
      );
    });

    it("reconhece pauta anual válida", () => {
      const cache = {
        students: [
          {
            id: "s1",
            student_number: "PROC-042",
            national_id: "001234LA042",
            status: "active",
            person_id: "p1",
          },
        ],
        enrollmentByStudentId: new Map([
          ["s1", { id: "e1", student_id: "s1", final_average: null }],
        ]),
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
      const analysis = propinasImporter.analyzeRow({ due_day: 35 }, cache as any);
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
