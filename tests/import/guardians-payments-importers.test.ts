import { describe, it, expect } from "vitest";
import { encarregadosImporter } from "@/features/import/importers/encarregados-importer";
import { pagamentosImporter } from "@/features/import/importers/pagamentos-importer";

describe("Guardians & Payments Importers", () => {
  describe("encarregadosImporter", () => {
    it("valida campos obrigatórios (aluno, nome, telefone)", () => {
      const cache = { students: [], existingPeople: [], existingGuardians: new Set() };
      const analysis = encarregadosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain(
        "Identificador do aluno (Nº Processo ou BI) é obrigatório.",
      );
      expect(analysis.errors).toContain("Nome do encarregado é obrigatório.");
      expect(analysis.errors).toContain("Telefone do encarregado é obrigatório.");
    });

    it("rejeita aluno inexistente", () => {
      const cache = { students: [], existingPeople: [], existingGuardians: new Set() };
      const analysis = encarregadosImporter.analyzeRow(
        {
          student_identifier: "PROC-9999",
          guardian_name: "Manuel Sebastião",
          phone: "924556677",
        },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain(`Aluno "PROC-9999" não encontrado no sistema.`);
    });

    it("reconhece encarregado válido quando aluno existe", () => {
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
        existingPeople: [],
        existingGuardians: new Set(),
      };
      const analysis = encarregadosImporter.analyzeRow(
        {
          student_identifier: "PROC-2026-042",
          guardian_name: "Manuel Sebastião",
          phone: "924556677",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });

  describe("pagamentosImporter", () => {
    it("valida aluno e montante positivo", () => {
      const cache = { students: [], existingReceipts: new Set() };
      const analysis = pagamentosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain(
        "Identificador do aluno (Nº Processo ou BI) é obrigatório.",
      );
      expect(analysis.errors).toContain(
        "Valor do pagamento deve ser um número positivo em Kwanzas.",
      );
    });

    it("reconhece pagamento válido para aluno existente", () => {
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
        openInvoices: [
          {
            id: "inv1",
            invoice_number: "FT-2026/0001",
            student_id: "s1",
            amount: 35000,
            due_date: "2026-02-10",
            remaining: 35000,
          },
        ],
        existingReceiptNumbers: new Set(),
      };
      const analysis = pagamentosImporter.analyzeRow(
        {
          student_identifier: "PROC-2026-042",
          amount: 35000,
          payment_method: "Multicaixa",
          receipt_number: "REC-12345",
        },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("detecta recibo duplicado", () => {
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
        openInvoices: [
          {
            id: "inv1",
            invoice_number: "FT-2026/0001",
            student_id: "s1",
            amount: 35000,
            due_date: "2026-02-10",
            remaining: 35000,
          },
        ],
        existingReceiptNumbers: new Set(["REC-12345"]),
      };
      const analysis = pagamentosImporter.analyzeRow(
        {
          student_identifier: "PROC-2026-042",
          amount: 35000,
          receipt_number: "REC-12345",
        },
        cache as any,
      );
      expect(analysis.status).toBe("duplicate");
      expect(analysis.duplicate_of).toBe("REC-12345");
    });
  });
});
