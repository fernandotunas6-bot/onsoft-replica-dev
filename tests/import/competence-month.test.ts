import { describe, it, expect } from "vitest";
import { parseCompetenceMonth } from "@/features/import/importers/finance-core";
import { pagamentosImporter } from "@/features/import/importers/pagamentos-importer";

/**
 * "Mês / Referência" é coluna obrigatória no modelo oficial de pagamentos e, até 2026-09-16,
 * nenhum importador a lia: um pagamento de Janeiro liquidava a fatura mais antiga em aberto,
 * fosse ela de que mês fosse. Agora escolhe a fatura do mês declarado.
 */

describe("parseCompetenceMonth", () => {
  it("lê o mês por extenso, com e sem acento", () => {
    expect(parseCompetenceMonth("Fevereiro 2026")).toBe("2026-02");
    expect(parseCompetenceMonth("março 2026")).toBe("2026-03");
    expect(parseCompetenceMonth("Propina de Setembro 2025")).toBe("2025-09");
  });

  it("lê formatos numéricos", () => {
    expect(parseCompetenceMonth("2026-02")).toBe("2026-02");
    expect(parseCompetenceMonth("02/2026")).toBe("2026-02");
    expect(parseCompetenceMonth("2026-2")).toBe("2026-02");
  });

  it("devolve null quando não é reconhecível", () => {
    expect(parseCompetenceMonth("")).toBeNull();
    expect(parseCompetenceMonth("Propina em atraso")).toBeNull();
    expect(parseCompetenceMonth("Fevereiro")).toBeNull();
    expect(parseCompetenceMonth("13/2026")).toBeNull();
  });
});

const student = {
  id: "s1",
  person_id: "p1",
  student_number: "PROC-2026-042",
  national_id: "005432190LA048",
  status: "active",
};

function cacheComFaturas() {
  return {
    students: [student],
    openInvoices: [
      {
        id: "inv-jan",
        invoice_number: "FT-2026/0001",
        student_id: "s1",
        amount: 35000,
        due_date: "2026-02-10",
        competence_month: "2026-01-01",
        remaining: 35000,
      },
      {
        id: "inv-fev",
        invoice_number: "FT-2026/0002",
        student_id: "s1",
        amount: 35000,
        due_date: "2026-03-10",
        competence_month: "2026-02-01",
        remaining: 35000,
      },
    ],
    existingReceiptNumbers: new Set<string>(),
  };
}

describe("pagamentos escolhe a fatura pelo mês declarado", () => {
  it("aceita o pagamento do mês que tem fatura em aberto", () => {
    const res = pagamentosImporter.analyzeRow(
      { student_identifier: "PROC-2026-042", month_ref: "Fevereiro 2026", amount: 35000 },
      cacheComFaturas() as never,
    );
    expect(res.status).toBe("valid");
  });

  it("recusa em vez de liquidar a fatura de outro mês", () => {
    const res = pagamentosImporter.analyzeRow(
      { student_identifier: "PROC-2026-042", month_ref: "Dezembro 2025", amount: 35000 },
      cacheComFaturas() as never,
    );
    expect(res.status).toBe("error");
    expect(res.errors[0]).toMatch(/não tem fatura em aberto para "Dezembro 2025"/);
  });

  it("sem mês declarado, liquida a mais antiga em aberto", () => {
    const res = pagamentosImporter.analyzeRow(
      { student_identifier: "PROC-2026-042", amount: 35000 },
      cacheComFaturas() as never,
    );
    expect(res.status).toBe("valid");
  });

  it("o nº de fatura tem precedência sobre o mês", () => {
    const res = pagamentosImporter.analyzeRow(
      {
        student_identifier: "PROC-2026-042",
        invoice_number: "FT-2026/0002",
        month_ref: "Dezembro 2025",
        amount: 35000,
      },
      cacheComFaturas() as never,
    );
    expect(res.status).toBe("valid");
  });
});
