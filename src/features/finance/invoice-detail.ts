import { invoiceNetTotal } from "./invoice-settlement";
import {
  gatewayChargeState,
  invoiceState,
  receiptState,
  type PaymentStateView,
} from "./payment-states";

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

export type InvoiceChargeRow = {
  id: string;
  method: string;
  amount: number;
  reference_entity: string | null;
  reference_number: string | null;
  status: string;
  status_message: string | null;
  receipt_number: string | null;
  created_at: string | null;
};

/**
 * Uma cobrança electrónica (AppyPay: Multicaixa Express ou referência). Não é um
 * pagamento: só passa a dinheiro recebido quando o fornecedor a confirma e o
 * recibo é lançado. Mantém o estado e a última mensagem do processamento.
 */
export type InvoiceDetailCharge = {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
  state: PaymentStateView;
  message: string | null;
  receiptNumber: string | null;
  createdAt: string | null;
};

const CHARGE_METHODS: Record<string, string> = {
  GPO: "Multicaixa Express",
  REF: "Referência Multicaixa",
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
  /** Cobranças electrónicas, da mais recente para a mais antiga; null para quem não as vê. */
  charges: InvoiceDetailCharge[] | null;
};

export function buildInvoiceDetail(input: {
  schoolId: string;
  invoice: InvoiceDetailRow;
  receipts: readonly InvoiceReceiptRow[];
  student: InvoiceDetailStudent | null;
  feeName: string | null;
  today: string;
  /** Só para a tesouraria e a administração; sem elas, a página não mostra a secção. */
  charges?: readonly InvoiceChargeRow[] | null;
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
    charges: input.charges
      ? [...input.charges]
          .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
          .map((charge) => ({
            id: charge.id,
            method: CHARGE_METHODS[charge.method] ?? charge.method,
            amount: Number(charge.amount ?? 0),
            reference:
              charge.reference_entity && charge.reference_number
                ? `${charge.reference_entity} / ${charge.reference_number}`
                : (charge.reference_number ?? null),
            state: gatewayChargeState(charge.status),
            message: charge.status_message,
            receiptNumber: charge.receipt_number,
            createdAt: charge.created_at,
          }))
      : null,
  };
}
