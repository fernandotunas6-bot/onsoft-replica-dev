import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A confirmação de um pagamento salarial era feita em vários passos no servidor (ler o
 * item, criar a saída de caixa, marcar pago), com código para desfazer a saída quando
 * outro pedido confirmava primeiro. Passou a uma só transacção na base
 * (`hr_confirm_payroll_payment_item`, 20260930193133), que bloqueia o item: dois pedidos
 * ao mesmo tempo não criam duas saídas. Este teste exige esse caminho.
 */
describe("confirmação de pagamento salarial", () => {
  const source = readFileSync("src/features/hr/payments.ts", "utf8");
  const start = source.indexOf("export const confirmPayrollPaymentItem");
  const confirm = source.slice(start, source.indexOf("export const", start + 1));

  it("confirma numa só transacção na base, com 2FA", () => {
    expect(confirm).toContain('requireAal2(context.claims, "Confirmar um pagamento salarial")');
    expect(confirm).toContain('rpc("hr_confirm_payroll_payment_item"');
  });

  it("não cria saídas de caixa no servidor fora da transacção", () => {
    expect(confirm).not.toContain('.from("siga_cash_expenses")');
  });
});
