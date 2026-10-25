import { describe, expect, it } from "vitest";
import { splitCashBalances } from "@/features/finance/cash-balances";

describe("saldo em numerário e saldo bancário", () => {
  it("não soma transferências e cartão ao dinheiro da gaveta", () => {
    const saldos = splitCashBalances(
      [
        { amount: 10_000, payment_method: "cash", status: "issued" },
        { amount: 25_000, payment_method: "bank_transfer", status: "issued" },
        { amount: 5_000, payment_method: "card", status: "issued" },
      ],
      [
        { amount: 3_000, method: "cash", status: "posted" },
        { amount: 8_000, method: "transfer", status: "posted" },
      ],
    );
    expect(saldos).toEqual({ drawer_balance: 7_000, bank_balance: 22_000 });
  });

  it("ignora recibos e despesas estornados", () => {
    const saldos = splitCashBalances(
      [{ amount: 10_000, payment_method: "cash", status: "reversed" }],
      [{ amount: 2_000, method: "cash", status: "reversed" }],
    );
    expect(saldos).toEqual({ drawer_balance: 0, bank_balance: 0 });
  });
});
