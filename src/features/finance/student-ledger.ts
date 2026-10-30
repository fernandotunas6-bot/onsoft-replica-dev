import { invoiceNetTotal, invoiceOpenAmount } from "./invoice-settlement";
import { invoiceState } from "./payment-states";

export type LedgerInvoice = {
  id: string;
  contract_id: string;
  amount: number;
  discount_amount: number;
  penalty_amount: number;
  due_date: string;
  status: string;
};
export type StudentBalance = {
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
  invoiceCount: number;
};

/** Recibos emitidos são a prova de pagamento; anulados/estornados não contam. */
export function studentBalances(
  invoices: readonly LedgerInvoice[],
  receipts: readonly { invoice_id: string; amount: number; status: string }[],
  studentByContract: ReadonlyMap<string, string>,
  today: string,
) {
  const paidByInvoice = new Map<string, number>();
  const cents = (value: number) => Math.round(Number(value) * 100);
  for (const receipt of receipts) {
    if (receipt.status !== "issued") continue;
    paidByInvoice.set(
      receipt.invoice_id,
      (paidByInvoice.get(receipt.invoice_id) ?? 0) + cents(receipt.amount),
    );
  }
  const balances = new Map<string, StudentBalance>();
  for (const invoice of invoices) {
    const studentId = studentByContract.get(invoice.contract_id);
    if (!studentId || invoice.status === "cancelled" || invoice.status === "void") continue;
    const balance = balances.get(studentId) ?? {
      billed: 0,
      paid: 0,
      outstanding: 0,
      overdue: 0,
      invoiceCount: 0,
    };
    const total = cents(invoiceNetTotal(invoice));
    const paid = Math.min(total, paidByInvoice.get(invoice.id) ?? 0);
    const open = cents(invoiceOpenAmount(total / 100, paid / 100));
    balance.billed += total;
    balance.paid += paid;
    balance.outstanding += open;
    if (invoice.due_date && invoice.due_date < today) balance.overdue += open;
    balance.invoiceCount++;
    balances.set(studentId, balance);
  }
  for (const balance of balances.values()) {
    balance.billed /= 100;
    balance.paid /= 100;
    balance.outstanding /= 100;
    balance.overdue /= 100;
  }
  return balances;
}

export function studentBalanceState(balance: StudentBalance) {
  if (!balance.invoiceCount) return { status: "pending" as const, label: "Sem facturas" };
  return invoiceState(
    {
      status: "open",
      total: balance.billed,
      paid: balance.paid,
      dueOn: balance.overdue > 0 ? "0001-01-01" : null,
    },
    "2000-01-01",
  );
}
