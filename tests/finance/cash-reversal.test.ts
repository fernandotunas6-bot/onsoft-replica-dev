import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoiceNetTotal, invoiceStatusFromPaid } from "@/features/finance/invoice-settlement";

describe("invoiceStatusFromPaid", () => {
  it("sem recibos válidos a fatura volta a aberta", () => {
    expect(invoiceStatusFromPaid(10_000, 0)).toBe("open");
  });
  it("parte paga fica parcial; tudo pago fica paga", () => {
    expect(invoiceStatusFromPaid(10_000, 4_000)).toBe("partially_paid");
    expect(invoiceStatusFromPaid(10_000, 10_000)).toBe("paid");
  });
  it("compara em cêntimos, sem erros de vírgula flutuante", () => {
    expect(invoiceStatusFromPaid(0.3, 0.1 + 0.2)).toBe("paid");
  });
});

describe("estorno de recibos (reverseCashEntry)", () => {
  const source = readFileSync("src/features/finance/server.ts", "utf8");
  const start = source.indexOf("export const reverseCashEntry");
  const handler = source.slice(start, source.indexOf("export const createPaymentPlan", start));

  it("exige 2FA, como registar o pagamento", () => {
    expect(handler).toMatch(/context\.claims\["aal"\] !== "aal2"/);
  });
  it("uses the atomic, authenticated database transaction", () => {
    expect(handler).toContain('context.supabase.rpc("siga_reverse_finance_receipt"');
    expect(handler).not.toMatch(/\.from\("finance_receipts"\)\s*\.update/);
  });
});

describe("invoiceNetTotal", () => {
  it("é o valor menos o desconto, nunca negativo", () => {
    expect(invoiceNetTotal({ amount: 10_000, discount_amount: 2_000 })).toBe(8_000);
    expect(invoiceNetTotal({ amount: 10_000, discount_amount: null })).toBe(10_000);
    expect(invoiceNetTotal({ amount: 1_000, discount_amount: 5_000 })).toBe(0);
  });
  it("com desconto, pagar o total com desconto deixa a fatura paga", () => {
    const total = invoiceNetTotal({ amount: 10_000, discount_amount: 2_000 });
    expect(invoiceStatusFromPaid(total, 8_000)).toBe("paid");
  });
});
