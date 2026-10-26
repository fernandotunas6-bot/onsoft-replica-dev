import { invoiceState, type PaymentStateView } from "./payment-states";

/**
 * Situação financeira de um aluno (secção Financeiro da ficha, SIGA Context
 * Engine): as faturas dele, com o que já foi pago e o que está em dívida. Só a
 * conta sobre o que `listInvoices` devolveu para esse aluno; o servidor decide
 * quem as lê. Uma fatura não é um recibo: «pago» é a soma dos recibos válidos.
 */

export type StudentInvoiceLike = {
  id: string;
  status: string;
  due_on: string | null;
  total_amount: number;
  amount_paid: number;
};

export type StudentInvoiceView<T extends StudentInvoiceLike> = T & {
  state: PaymentStateView;
  /** O que falta pagar (nunca negativo). */
  openAmount: number;
};

export type StudentFinanceSummary<T extends StudentInvoiceLike> = {
  billed: number;
  paid: number;
  /** Em dívida: o que falta pagar nas faturas não anuladas. */
  outstanding: number;
  /** A parte da dívida já vencida. */
  overdue: number;
  /** Por pagar ou pagas em parte: a de prazo mais antigo primeiro. */
  open: StudentInvoiceView<T>[];
  /** Pagas: a de prazo mais recente primeiro. */
  settled: StudentInvoiceView<T>[];
};

export function summarizeStudentInvoices<T extends StudentInvoiceLike>(
  invoices: readonly T[],
  today: string,
): StudentFinanceSummary<T> {
  const open: StudentInvoiceView<T>[] = [];
  const settled: StudentInvoiceView<T>[] = [];
  let billed = 0;
  let paid = 0;
  let outstanding = 0;
  let overdue = 0;
  for (const invoice of invoices) {
    const total = Number(invoice.total_amount ?? 0);
    const amountPaid = Number(invoice.amount_paid ?? 0);
    const state = invoiceState(
      { status: invoice.status, total, paid: amountPaid, dueOn: invoice.due_on },
      today,
    );
    // Uma anulada não conta para nada: nem faturado, nem dívida.
    if (state.status === "cancelled") continue;
    const openAmount = state.status === "paid" ? 0 : Math.max(total - amountPaid, 0);
    billed += total;
    paid += Math.min(amountPaid, total);
    outstanding += openAmount;
    if (state.status === "overdue") overdue += openAmount;
    (state.status === "paid" ? settled : open).push({ ...invoice, state, openAmount });
  }
  open.sort((a, b) => (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31"));
  settled.sort((a, b) => (b.due_on ?? "").localeCompare(a.due_on ?? ""));
  return { billed, paid, outstanding, overdue, open, settled };
}

/** «2026-10-05» → «05/10/2026», sem passar por Date (que mudaria o dia no fuso). */
export function formatIsoDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
