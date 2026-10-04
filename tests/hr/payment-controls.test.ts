import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/hr/payments.ts", "utf8");
const handler = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("controlos dos pagamentos salariais", () => {
  it("mudar o destino (IBAN) de um salário exige 2FA e fica na auditoria, mascarado", () => {
    const body = handler("upsertHrPaymentDestination");
    expect(body).toMatch(/requireAal2\(context\.claims/);
    expect(body).toContain('rpc("hr_upsert_payment_destination"');
    expect(body).not.toContain('.from("audit_logs")');
  });

  it("confirmar um pagamento salarial exige 2FA", () => {
    expect(handler("confirmPayrollPaymentItem")).toMatch(/requireAal2\(context\.claims/);
  });
});
