import { z } from "zod";

export const financeListInputSchema = z.object({
  limit: z.number().int().min(1).max(250).default(100),
});

export const recordInvoicePaymentInputSchema = z.object({
  invoiceId: z.string().uuid(),
  // Referência opcional do funcionário — o número oficial do recibo é gerado
  // atomicamente pela função register_payment (private.next_document_number),
  // nunca por este valor. Ver features/finance/server.ts.
  receiptNumber: z.string().trim().max(64).optional(),
  amount: z.number().positive().max(999_999_999_999.99),
  method: z.enum([
    "cash",
    "multicaixa",
    "transfer",
    "express",
    "multicaixa_express",
    "unitel_money",
  ]),
  reference: z.string().trim().max(160).optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
});

export type RecordInvoicePaymentInput = z.infer<typeof recordInvoicePaymentInputSchema>;

export const issueInvoiceInputSchema = z.object({
  studentId: z.string().uuid(),
  dueOn: z.string().date(),
  issuedOn: z.string().date().optional(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().min(1).max(80),
  /** Sem valor, o preço do plano de propinas (o da classe do aluno, se houver). */
  amount: z.number().positive().max(999_999_999_999.99).optional(),
});

export type IssueInvoiceInput = z.infer<typeof issueInvoiceInputSchema>;

export const recordCashExpenseInputSchema = z.object({
  documentNumber: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(80),
  amount: z.number().positive().max(999_999_999_999.99),
  method: z.enum([
    "cash",
    "multicaixa",
    "transfer",
    "express",
    "multicaixa_express",
    "unitel_money",
  ]),
  reference: z.string().trim().max(160).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export type RecordCashExpenseInput = z.infer<typeof recordCashExpenseInputSchema>;

export const reverseCashEntryInputSchema = z.object({
  cashEntryId: z.string().uuid(),
  // 5..300 é o que `finance_receipts_reversal_reason_check` admite, e o mínimo de 5 é
  // também o que `private.reverse_receipt` exige. Com os limites anteriores (3..500), um
  // motivo curto ou longo demais passava a validação e só rebentava na base, com uma
  // mensagem que não dizia ao utilizador o que corrigir. As despesas de caixa não têm
  // restrição própria, pelo que o intervalo mais apertado dos dois serve para ambas.
  reason: z.string().trim().min(5).max(300),
});

export type ReverseCashEntryInput = z.infer<typeof reverseCashEntryInputSchema>;

export const cancelInvoiceInputSchema = z.object({
  invoiceId: z.string().uuid(),
  // BD exige 5-300 caracteres quando preenchido (finance_invoices_cancellation_reason_check).
  // Obrigatório: uma fatura anulada sem motivo é o que esconde um desvio.
  reason: z.string().trim().min(5, "Indique o motivo da anulação.").max(300),
});
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceInputSchema>;

export const cancelPaymentPlanInputSchema = z.object({
  planId: z.string().uuid(),
});
export type CancelPaymentPlanInput = z.infer<typeof cancelPaymentPlanInputSchema>;

export const feeItemKindSchema = z.enum(["tuition", "enrollment"]);

export const upsertFeePlanSettingsInputSchema = z.object({
  planName: z.string().trim().min(2).max(120).default("Plano padrão"),
  tuitionAmount: z.number().positive().max(999_999_999_999.99),
  enrollmentAmount: z.number().positive().max(999_999_999_999.99),
});

export type UpsertFeePlanSettingsInput = z.infer<typeof upsertFeePlanSettingsInputSchema>;

export const createPaymentPlanInputSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  channel: z.enum([
    "cash",
    "multicaixa",
    "transfer",
    "express",
    "multicaixa_express",
    "unitel_money",
  ]),
  installments: z.number().int().min(1).max(24).default(1),
  reference: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CreatePaymentPlanInput = z.infer<typeof createPaymentPlanInputSchema>;

export function officialReceiptBody(input: {
  schoolName: string;
  studentName: string;
  invoiceNumber: string;
  receiptNumber: string;
  amountLabel: string;
}) {
  return `A tesouraria da ${input.schoolName} confirma o recebimento de ${input.amountLabel}, referente à fatura ${input.invoiceNumber} do(a) aluno(a) ${input.studentName}. Recibo n.º ${input.receiptNumber}.`;
}

export function paymentStatusFromInvoices(
  invoices: Array<{ status: string; due_on?: string | null }>,
  today = new Date().toISOString().slice(0, 10),
): "settled" | "pending" | "overdue" | null {
  if (invoices.length === 0) return null;
  const open = invoices.filter((invoice) => invoice.status !== "paid" && invoice.status !== "void");
  if (open.length === 0) return "settled";
  if (open.some((invoice) => invoice.due_on && invoice.due_on < today)) return "overdue";
  return "pending";
}

export const syncStudentToPayflowInputSchema = z.object({
  studentId: z.string().uuid(),
});
export type SyncStudentToPayflowInput = z.infer<typeof syncStudentToPayflowInputSchema>;
