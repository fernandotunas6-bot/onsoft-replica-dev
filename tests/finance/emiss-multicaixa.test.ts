import { describe, expect, it } from "vitest";
import {
  configuredEmisEntity,
  generateMulticaixaReference,
  normalizePaymentReference,
} from "@/features/finance/emiss-multicaixa";
import { referencesMatch } from "@/features/finance/gateway-webhook-schemas";
import { referenceDigitsForInvoice } from "../../scripts/siga/gateway-reference.mjs";

describe("configuredEmisEntity", () => {
  it("usa merchantId numérico como entidade EMIS", () => {
    expect(configuredEmisEntity({ merchantId: "12345" })).toBe("12345");
    expect(configuredEmisEntity({ emisEntity: "00123" })).toBe("00123");
  });

  it("sem entidade válida não há entidade — nunca uma de exemplo", () => {
    expect(configuredEmisEntity({ merchantId: "SIGA-KEY" })).toBeNull();
    expect(configuredEmisEntity(null)).toBeNull();
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
    const fromTs = normalizePaymentReference(
      generateMulticaixaReference("99824", invoiceId, 1).reference,
    );
    expect(referenceDigitsForInvoice(invoiceId)).toBe(fromTs);
  });
});

describe("configuredEmisEntity", () => {
  it("devolve a entidade da escola, ou nada — nunca a de exemplo", async () => {
    const { configuredEmisEntity } = await import("@/features/finance/emiss-multicaixa");
    expect(configuredEmisEntity({ emisEntity: "12345" })).toBe("12345");
    expect(configuredEmisEntity({ merchantId: "54321" })).toBe("54321");
    expect(configuredEmisEntity({ merchantId: "SIGA-KEY" })).toBeNull();
    expect(configuredEmisEntity({})).toBeNull();
    expect(configuredEmisEntity(null)).toBeNull();
  });
});

describe("sem entidade EMIS de exemplo", () => {
  it("nenhum código de servidor gera referências com uma entidade por omissão", async () => {
    const mod = await import("@/features/finance/emiss-multicaixa");
    expect("DEFAULT_EMIS_ENTITY" in mod).toBe(false);
    expect("resolveSchoolEmisEntity" in mod).toBe(false);
    const { readFileSync } = await import("node:fs");
    const server = readFileSync("src/features/finance/server.ts", "utf8");
    expect(server).not.toMatch(/99824/);
  });
});
