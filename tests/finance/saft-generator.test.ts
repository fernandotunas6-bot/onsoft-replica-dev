import { describe, expect, it } from "vitest";
import { buildSaftAoXml, generateSaftInputSchema } from "@/features/finance/saft-generator";

describe("SAFT-AO AGT XML Generator", () => {
  it("validates SAFT input schema defaults", () => {
    const input = generateSaftInputSchema.parse({});
    expect(input.fiscalYear).toBe(2026);
  });

  it("builds valid SAFT-AO XML compliant with AGT Decreto 312/18 structure", () => {
    const school = {
      nif: "5417001234",
      name: "Complexo Escolar SIGA de Luanda",
      address: "Avenida 4 de Fevereiro",
      city: "Luanda",
    };

    const invoices = [
      {
        id: "inv-001",
        invoiceNo: "FT 2026/0001",
        invoiceType: "FT" as const,
        date: "2026-08-15",
        customerName: "Manuel Domingos",
        customerNif: "005481234LA042",
        description: "Propina de Agosto / 12ª Classe",
        amount: 45000,
        status: "N" as const,
      },
    ];

    const xml = buildSaftAoXml(school, invoices, { fiscalYear: 2026 });

    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(`urn:OECD:StandardAuditFile-Tax:AO_1.01_01`);
    expect(xml).toContain(`<CompanyID>5417001234</CompanyID>`);
    expect(xml).toContain(`<CompanyName>Complexo Escolar SIGA de Luanda</CompanyName>`);
    expect(xml).toContain(`<SoftwareCertificateNumber>0/AGT/2026</SoftwareCertificateNumber>`);
    expect(xml).toContain(`<CustomerTaxID>005481234LA042</CustomerTaxID>`);
    expect(xml).toContain(`<InvoiceNo>FT 2026/0001</InvoiceNo>`);
    expect(xml).toContain(`<CreditAmount>45000.00</CreditAmount>`);
    expect(xml).toContain(`<TaxExemptionCode>M00</TaxExemptionCode>`);
    expect(xml).toContain(`Isento nos termos da alinea e) do art 12 CIVA`);
  });
});
