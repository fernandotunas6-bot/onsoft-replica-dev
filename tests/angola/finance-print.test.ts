import { describe, expect, it } from "vitest";
import {
  bankingPaymentRows,
  bankingPaymentSections,
  buildFinancePrintSchool,
} from "@/lib/finance-print";
import { overlayServico } from "@/features/documents/print-overlays";

describe("finance-print", () => {
  it("monta linhas de pagamento com IBAN formatado", () => {
    const rows = bankingPaymentRows({
      account_holder: "Escola Exemplo Lda",
      bank_name: "BAI",
      iban: "AO20004430156278343694804",
      swift: "BAIPAOLU",
      multicaixa_merchant: "MCX-123",
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        { label: "Titular", value: "Escola Exemplo Lda" },
        { label: "IBAN", value: "AO20 0044 3015 6278 3436 9480 4" },
        { label: "Multicaixa Express", value: "MCX-123" },
      ]),
    );
  });

  it("ignora secção quando não há dados bancários", () => {
    expect(bankingPaymentSections(null)).toEqual([]);
    expect(bankingPaymentSections({ iban: "" })).toEqual([]);
  });

  it("inclui logótipo no contexto de impressão financeira", () => {
    const school = buildFinancePrintSchool(
      {
        id: "s1",
        name: "Colégio",
        nif: "5000123456",
        director_name: null,
        phone: null,
        email: null,
        province: null,
        municipality: null,
        address: null,
        academic_year: "2025/2026",
        currency: "AOA",
        evaluation_periods: 3,
        passing_grade: 10,
        preferences: {},
        version: 1,
        branding: { logo_url: "https://cdn/logo.png", motto: null },
      },
      "2025/2026",
    );
    expect(school.logoUrl).toBe("https://cdn/logo.png");
  });

  it("anexa dados de pagamento em documentos de tesouraria", () => {
    const overlay = overlayServico({
      name: "Recibo de pagamento",
      reference: "RC-1",
      status: "Pago",
      parties: [],
      sections: [{ title: "Quitação", rows: [{ label: "Valor", value: "10 000 Kz" }] }],
      banking: { iban: "AO20004430156278343694804", bank_name: "BAI" },
    });
    expect(overlay.sections).toHaveLength(2);
    expect(overlay.sections[1]?.title).toBe("Dados de pagamento");
    expect(overlay.sections[1]?.rows?.[0]?.label).toBe("Banco");
  });
});
