import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoiceStatusFromPaid } from "@/features/finance/invoice-settlement";

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
  it("só estorna recibos ainda válidos (não reescreve um estorno anterior)", () => {
    expect(handler).toMatch(
      /\.from\("finance_receipts"\)\s*\.update\([\s\S]*?\.eq\("status", "issued"\)/,
    );
  });
  it("repõe o estado da fatura a partir dos recibos que ficam", () => {
    expect(handler).toContain("invoiceStatusFromPaid(");
  });
});
