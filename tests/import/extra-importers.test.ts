import { describe, it, expect } from "vitest";
import { dividasImporter } from "@/features/import/importers/dividas-importer";
import { funcionariosImporter } from "@/features/import/importers/funcionarios-importer";
import { horariosImporter } from "@/features/import/importers/horarios-importer";

describe("Extra Importers (dividas, funcionarios, horarios)", () => {
  describe("dividasImporter", () => {
    it("valida campos obrigatórios (aluno e montante)", () => {
      const cache = { students: [], existingInvoiceNumbers: new Set() };
      const analysis = dividasImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Identificador do aluno (Nº Processo ou BI) é obrigatório.");
      expect(analysis.errors).toContain("Valor em dívida deve ser um número positivo em Kwanzas.");
    });

    it("rejeita aluno inexistente", () => {
      const cache = { students: [], existingInvoiceNumbers: new Set() };
      const analysis = dividasImporter.analyzeRow(
        { student_identifier: "PROC-9999", amount_due: 35000 },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain(`Aluno "PROC-9999" não encontrado no sistema escolar.`);
    });

    it("reconhece dívida válida", () => {
      const cache = {
        students: [
          {
            id: "s1",
            person_id: "p1",
            student_number: "PROC-2026-042",
            national_id: "005432190LA048",
            status: "active",
          },
        ],
        existingInvoiceNumbers: new Set(),
      };
      const analysis = dividasImporter.analyzeRow(
        {
          student_identifier: "PROC-2026-042",
          amount_due: 35000,
          invoice_number: "FT-2026-001",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });

  describe("funcionariosImporter", () => {
    it("valida campos obrigatórios do funcionário", () => {
      const cache = { existingPeople: [], existingRoleKeys: new Set() };
      const analysis = funcionariosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Nome completo do funcionário é obrigatório.");
      expect(analysis.errors).toContain("Nº do Bilhete de Identidade é obrigatório.");
      expect(analysis.errors).toContain("Telefone de contacto é obrigatório.");
      expect(analysis.errors).toContain("Cargo ou função do funcionário é obrigatório.");
    });

    it("reconhece funcionário válido", () => {
      const cache = { existingPeople: [], existingRoleKeys: new Set() };
      const analysis = funcionariosImporter.analyzeRow(
        {
          full_name: "António Carlos dos Santos",
          id_number: "004567891HA021",
          phone: "912334455",
          role_title: "Técnico de Secretaria",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });

  describe("horariosImporter", () => {
    it("valida turma, disciplina, dia e horas", () => {
      const cache = { classGroups: [], subjects: [], existingSlots: new Set() };
      const analysis = horariosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Turma é obrigatória.");
      expect(analysis.errors).toContain("Disciplina é obrigatória.");
      expect(analysis.errors).toContain("Dia da semana inválido (ex: Segunda-feira, Terça-feira...).");
      expect(analysis.errors).toContain("Hora de início é obrigatória (ex: 07:30).");
      expect(analysis.errors).toContain("Hora de fim é obrigatória (ex: 08:15).");
    });

    it("reconhece horário válido", () => {
      const cache = {
        classGroups: [{ id: "g1", code: "10A-M", name: "10ª Classe A" }],
        subjects: [{ id: "sub1", code: "MAT", name: "Matemática" }],
        existingSlots: new Set(),
      };
      const analysis = horariosImporter.analyzeRow(
        {
          class_group: "10A-M",
          subject: "MAT",
          weekday: "Segunda-feira",
          start_time: "07:30",
          end_time: "08:15",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });
});
