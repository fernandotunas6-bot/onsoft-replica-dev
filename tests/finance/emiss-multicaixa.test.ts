import { describe, expect, it } from "vitest";
import {
  generateMulticaixaReference,
  emisEntityFromIntegrationConfig,
  normalizePaymentReference,
  DEFAULT_EMIS_ENTITY,
} from "@/features/finance/emiss-multicaixa";
import { referencesMatch } from "@/features/finance/gateway-webhook-schemas";
import { referenceDigitsForInvoice } from "../../scripts/siga/gateway-reference.mjs";

describe("emisEntityFromIntegrationConfig", () => {
  it("usa merchantId numérico como entidade EMIS", () => {
    expect(emisEntityFromIntegrationConfig({ merchantId: "12345" })).toBe("12345");
  });

  it("cai no default quando merchantId não é numérico", () => {
    expect(emisEntityFromIntegrationConfig({ merchantId: "SIGA-KEY" })).toBe(DEFAULT_EMIS_ENTITY);
    expect(emisEntityFromIntegrationConfig(null)).toBe(DEFAULT_EMIS_ENTITY);
  });
});

describe("generateMulticaixaReference", () => {
  it("é determinística para a mesma fatura", () => {
    const invoiceId = "a1111111-2222-3333-4444-555555555555";
    const first = generateMulticaixaReference("99824", invoiceId, 45000);
    const second = generateMulticaixaReference("99824", invoiceId, 45000);
    expect(first.reference).toBe(second.reference);
    expect(normalizePaymentReference(first.reference)).toHaveLength(9);
  });

  it("muda quando a fatura muda", () => {
    const a = generateMulticaixaReference("99824", "inv-a", 1000);
    const b = generateMulticaixaReference("99824", "inv-b", 1000);
    expect(a.reference).not.toBe(b.reference);
  });
});

describe("referencesMatch", () => {
  it("ignora espaços na referência", () => {
    expect(referencesMatch("123 456 789", "123456789")).toBe(true);
    expect(referencesMatch("123456789", "123 456 789")).toBe(true);
    expect(referencesMatch("123456789", "999999999")).toBe(false);
  });
});

describe("gateway-simulate referenceDigitsForInvoice", () => {
  it("alinha com generateMulticaixaReference", () => {
    const invoiceId = "b2222222-3333-4444-5555-666666666666";
    const fromTs = normalizePaymentReference(generateMulticaixaReference("99824", invoiceId, 1).reference);
    expect(referenceDigitsForInvoice(invoiceId)).toBe(fromTs);
  });
});
