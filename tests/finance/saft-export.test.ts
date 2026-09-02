import { describe, expect, it } from "vitest";
import {
  invoiceDateInSaftPeriod,
  mapFinanceInvoiceToSaftItem,
  saftExportBlocked,
  saftPeriodBounds,
  validateSaftSchoolReadiness,
} from "@/features/finance/saft-export";

describe("validateSaftSchoolReadiness", () => {
  it("bloqueia NIF em falta", () => {
    const issues = validateSaftSchoolReadiness({ name: "Escola", nif: "" });
    expect(saftExportBlocked(issues)).toBe(true);
  });

  it("aceita NIF AGT válido", () => {
    const issues = validateSaftSchoolReadiness({ name: "Escola", nif: "5417001234" });
    expect(saftExportBlocked(issues)).toBe(false);
  });
});

describe("saftPeriodBounds", () => {
  it("usa ano fiscal completo por defeito", () => {
    expect(saftPeriodBounds({ fiscalYear: 2026 })).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });
});

describe("mapFinanceInvoiceToSaftItem", () => {
  it("calcula total com desconto e marca anuladas", () => {
    const item = mapFinanceInvoiceToSaftItem({
      id: "inv-1",
      invoice_number: "FT 2026/0001",
      created_at: "2026-03-15T10:00:00Z",
      amount: 50000,
      discount_amount: 5000,
      status: "cancelled",
      description: "Propina",
      customerName: "Aluno Teste",
      fiscalYear: 2026,
    });
    expect(item.amount).toBe(45000);
    expect(item.status).toBe("A");
    expect(item.invoiceNo).toBe("FT 2026/0001");
  });
});

describe("invoiceDateInSaftPeriod", () => {
  it("filtra datas fora do período", () => {
    expect(invoiceDateInSaftPeriod("2026-06-01", "2026-01-01", "2026-12-31")).toBe(true);
    expect(invoiceDateInSaftPeriod("2025-12-31", "2026-01-01", "2026-12-31")).toBe(false);
  });
});
