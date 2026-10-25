import { describe, expect, it } from "vitest";
import { invoiceOpenAmount, invoiceStatusFromPaid } from "@/features/finance/invoice-settlement";

/**
 * O que falta pagar, em cêntimos: a subtracção em vírgula flutuante deixava resíduos e
 * uma fatura paga contava como «em aberto» (aluno com dívida vencida no painel).
 */
describe("invoiceOpenAmount", () => {
  it("sem resíduos de vírgula flutuante", () => {
    const paid = 0.1 + 0.2;
    expect(0.3 - paid).not.toBe(0);
    expect(invoiceOpenAmount(0.3, paid)).toBe(0);
    expect(invoiceOpenAmount(1000.3, 1000.1 + 0.2)).toBe(0);
  });

  it("concorda com o estado da fatura", () => {
    for (const [total, paid] of [
      [100, 100],
      [100, 99.99],
      [5000.35, 2500.2 + 2500.15],
      [10, 0],
    ] as const) {
      const status = invoiceStatusFromPaid(total, paid);
      expect(invoiceOpenAmount(total, paid) > 0).toBe(status !== "paid");
    }
  });

  it("pago a mais não dá valor negativo", () => {
    expect(invoiceOpenAmount(100, 120)).toBe(0);
    expect(invoiceOpenAmount(100, 40.25)).toBe(59.75);
  });
});
