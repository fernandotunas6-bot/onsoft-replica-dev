import { invoiceNetTotal } from "./invoice-settlement";
import { invoiceState, receiptState, type PaymentStateView } from "./payment-states";

/**
 * Detalhe de uma fatura (SIGA Context Engine, contexto financeiro): a fatura, o
 * aluno a quem foi emitida e os recibos que a pagam. Uma fatura não é um recibo:
 * o «pago» é a soma dos recibos válidos, e cada recibo aparece com o seu estado.
 * Só a montagem; o servidor (`getInvoiceDetail`) lê tudo da escola activa.
 */

export type InvoiceDetailRow = {
  id: string;
  invoice_number: string;
  competence_month: string | null;
  amount: number;
  discount_amount: number | null;
  penalty_amount: number | null;
  due_date: string | null;
  status: string;
  created_at: string | null;
  cancellation_reason?: string | null;
};

export type InvoiceReceiptRow = {
  id: string;
  receipt_number: string | null;
  amount: number;
  paid_on: string | null;
  payment_method: string | null;
  status: string;
  reversal_reason: string | null;
};

export type InvoiceDetailReceipt = {
  id: string;
  number: string;
  amount: number;
  paidOn: string | null;
  method: string | null;
  state: PaymentStateView;
  reversalReason: string | null;
};

export type InvoiceDetailStudent = {
  id: string;
  name: string;
  registrationNumber: string;
};

export type InvoiceDetail = {
  id: string;
  schoolId: string;
  number: string;
  description: string;
  competenceMonth: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  /** Valor antes do desconto e da multa. */
  amount: number;
  discount: number;
  penalty: number;
  total: number;
  paid: number;
  openAmount: number;
  state: PaymentStateView;
  cancellationReason: string | null;
  student: InvoiceDetailStudent | null;
  /** Do pagamento mais antigo para o mais recente. */
  receipts: InvoiceDetailReceipt[];
};

export function buildInvoiceDetail(input: {
  schoolId: string;
  invoice: InvoiceDetailRow;
  receipts: readonly InvoiceReceiptRow[];
  student: InvoiceDetailStudent | null;
  feeName: string | null;
  today: string;
}): InvoiceDetail {
  const { invoice } = input;
  const total = invoiceNetTotal(invoice);
  const paid = input.receipts
    .filter((receipt) => receipt.status !== "reversed")
    .reduce((sum, receipt) => sum + Number(receipt.amount ?? 0), 0);
  const state = invoiceState(
    { status: invoice.status, total, paid, dueOn: invoice.due_date },
    input.today,
  );
  const settled = state.status === "paid" || state.status === "cancelled";
  return {
    id: invoice.id,
    schoolId: input.schoolId,
    number: invoice.invoice_number,
    description: input.feeName ?? "Fatura escolar",
    competenceMonth: invoice.competence_month,
    issuedOn: invoice.created_at?.slice(0, 10) ?? null,
    dueOn: invoice.due_date,
    amount: Number(invoice.amount ?? 0),
    discount: Number(invoice.discount_amount ?? 0),
    penalty: Number(invoice.penalty_amount ?? 0),
    total,
    paid: Math.min(paid, total),
    openAmount: settled ? 0 : Math.max(total - paid, 0),
    state,
    cancellationReason: invoice.cancellation_reason ?? null,
    student: input.student,
    receipts: [...input.receipts]
      .sort((a, b) => (a.paid_on ?? "").localeCompare(b.paid_on ?? ""))
      .map((receipt) => ({
        id: receipt.id,
        number: receipt.receipt_number ?? "Recibo",
        amount: Number(receipt.amount ?? 0),
        paidOn: receipt.paid_on,
        method: receipt.payment_method,
        state: receiptState(receipt.status),
        reversalReason: receipt.reversal_reason,
      })),
  };
}
