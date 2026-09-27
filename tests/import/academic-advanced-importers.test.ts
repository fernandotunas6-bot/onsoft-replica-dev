import { describe, it, expect } from "vitest";
import { presencasImporter } from "@/features/import/importers/presencas-importer";
import { pautasImporter } from "@/features/import/importers/pautas-importer";
import { propinasImporter } from "@/features/import/importers/propinas-importer";

describe("Academic Advanced Importers (presencas, pautas, propinas)", () => {
  describe("presencasImporter", () => {
    // Presenças são importadas por sessão (turma + disciplina + data + estado),
    // não como taxa agregada — evita misturar sessões diferentes.
    const refs = {
      academicYearId: "y1",
      students: [
        {
          id: "s1",
          student_number: "PROC-042",
          national_id: "001234LA042",
          status: "active",
          person_id: "p1",
        },
      ],
      groups: [{ id: "g1", code: "10A", name: "10ª A" }],
      subjects: [{ id: "sub1", code: "MAT", name: "Matemática" }],
    };

    it("valida campos obrigatórios (aluno, turma, disciplina, data e estado)", () => {
      const analysis = presencasImporter.analyzeRow({}, { ...refs, academicYearId: null } as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Seleccione o ano lectivo antes de importar presenças.");
      expect(analysis.errors).toContain("Identificador do aluno é obrigatório.");
      expect(analysis.errors).toContain("Turma é obrigatória para registar a presença.");
      expect(analysis.errors).toContain("Disciplina é obrigatória para registar a presença.");
    });

    it("rejeita estado de presença inválido", () => {
      const analysis = presencasImporter.analyzeRow(
        {
          student_identifier: "PROC-042",
          turma: "10A",
          disciplina: "MAT",
          data: "2026-03-02",
          estado: "talvez",
        },
        refs as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors.join(" ")).toMatch(/Estado de presença inválido/);
    });

    it("reconhece presença válida", () => {
      const analysis = presencasImporter.analyzeRow(
        {
          student_identifier: "PROC-042",
          turma: "10A",
          disciplina: "MAT",
          data: "2026-03-02",
          estado: "presente",
        },
        refs as any,
      );
      expect(analysis.errors).toEqual([]);
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
