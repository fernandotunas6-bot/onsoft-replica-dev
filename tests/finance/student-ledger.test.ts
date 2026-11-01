import { describe, it, expect } from "vitest";
import {
  studentBalances,
  studentBalanceState,
  type LedgerInvoice,
} from "@/features/finance/student-ledger";

const invoice = (patch: Partial<LedgerInvoice> = {}): LedgerInvoice => ({
  id: "i1",
  contract_id: "c1",
  amount: 25000,
  discount_amount: 0,
  penalty_amount: 0,
  due_date: "2026-10-01",
  status: "open",
  ...patch,
});
const contracts = new Map([
  ["c1", "s1"],
  ["c2", "s1"],
]);
const today = "2026-10-28";

describe("lista financeira por aluno", () => {
  it("parcial 25.000 - 10.000 = dívida 15.000; estornos não contam", () => {
    const balance = studentBalances(
      [invoice()],
      [
        { invoice_id: "i1", amount: 10000, status: "issued" },
        { invoice_id: "i1", amount: 15000, status: "reversed" },
        { invoice_id: "i1", amount: 15000, status: "pending" },
      ],
      contracts,
      today,
    ).get("s1")!;
    expect(balance).toEqual({
      billed: 25000,
      paid: 10000,
      outstanding: 15000,
      overdue: 15000,
      invoiceCount: 1,
    });
    expect(studentBalanceState(balance).status).toBe("overdue");
  });
  it("agrega contratos do mesmo aluno; ignora anuladas e outros anos/escolas fora do mapa", () => {
    const balances = studentBalances(
      [
        invoice(),
        invoice({ id: "i2", contract_id: "c2", due_date: "2026-11-01" }),
        invoice({ id: "i3", status: "cancelled" }),
        invoice({ id: "foreign", contract_id: "other" }),
      ],
      [],
      contracts,
      today,
    );
    expect(balances.get("s1")).toEqual({
      billed: 50000,
      paid: 0,
      outstanding: 50000,
      overdue: 25000,
      invoiceCount: 2,
    });
    expect(balances.size).toBe(1);
  });
  it("inclui desconto/multa e elimina resíduos de cêntimos", () => {
    const balance = studentBalances(
      [invoice({ amount: 1000.2, discount_amount: 100, penalty_amount: 100 })],
      [
        { invoice_id: "i1", amount: 500.1, status: "issued" },
        { invoice_id: "i1", amount: 500.1, status: "issued" },
      ],
      contracts,
      today,
    ).get("s1")!;
    expect(balance.outstanding).toBe(0);
    expect(balance.paid).toBe(1000.2);
    expect(studentBalanceState(balance)).toEqual({ status: "paid", label: "Paga" });
  });
  it("um estado pago sem recibo não prova dinheiro recebido", () => {
    const balance = studentBalances([invoice({ status: "paid" })], [], contracts, today).get("s1")!;
    expect(balance.paid).toBe(0);
    expect(balance.outstanding).toBe(25000);
  });
  it("sem facturas não significa pago", () => {
    expect(
      studentBalanceState({ billed: 0, paid: 0, outstanding: 0, overdue: 0, invoiceCount: 0 })
        .label,
    ).toBe("Sem facturas");
  });
});
