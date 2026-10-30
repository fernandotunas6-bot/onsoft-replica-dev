import { invoiceState, type PaymentStateView } from "./payment-states";
import { invoiceOpenAmount } from "./invoice-settlement";

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
  // Agregar em cêntimos evita resíduos de vírgula flutuante e garante que
  // a dívida apresentada na ficha coincide com a liquidação da fatura.
  let billedCents = 0;
  let paidCents = 0;
  let outstandingCents = 0;
  let overdueCents = 0;
  for (const invoice of invoices) {
    const total = Number(invoice.total_amount ?? 0);
    const amountPaid = Number(invoice.amount_paid ?? 0);
    const state = invoiceState(
      { status: invoice.status, total, paid: amountPaid, dueOn: invoice.due_on },
      today,
    );
    // Uma anulada não conta para nada: nem faturado, nem dívida.
    if (state.status === "cancelled") continue;
    const totalCents = Math.max(0, Math.round(total * 100));
    const receiptCents = Math.max(0, Math.round(amountPaid * 100));
    const openAmount = invoiceOpenAmount(total, amountPaid);
    const openCents = Math.round(openAmount * 100);
    billedCents += totalCents;
    paidCents += Math.min(receiptCents, totalCents);
    outstandingCents += openCents;
    if (state.status === "overdue") overdueCents += openCents;
    (state.status === "paid" ? settled : open).push({ ...invoice, state, openAmount });
  }
  open.sort((a, b) => (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31"));
  settled.sort((a, b) => (b.due_on ?? "").localeCompare(a.due_on ?? ""));
  return {
    billed: billedCents / 100,
    paid: paidCents / 100,
    outstanding: outstandingCents / 100,
    overdue: overdueCents / 100,
    open,
    settled,
  };
}

/** «2026-10-05» → «05/10/2026», sem passar por Date (que mudaria o dia no fuso). */
export function formatIsoDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
