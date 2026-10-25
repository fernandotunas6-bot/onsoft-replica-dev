import { z } from "zod";
import { schoolTodayIso } from "@/lib/school-date";

/**
 * Dia em que a família pagou, tirado do comprovativo: `YYYY-MM-DD` real e nunca depois
 * de hoje na escola. A multa por atraso é a desse dia, não a do dia em que a tesouraria
 * confirma.
 */
export const paidOnDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data do pagamento inválida.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Data do pagamento inválida.")
  .refine((value) => value <= schoolTodayIso(), "A data do pagamento não pode ser no futuro.");

/** Meio-dia em Luanda: `paidOnIso` lê os 10 primeiros caracteres sem mudar de dia. */
export function paidAtFromPaidOn(paidOn: string) {
  return `${paidOn}T12:00:00+01:00`;
}

export const financeListInputSchema = z.object({
  limit: z.number().int().min(1).max(250).default(100),
});

/**
 * Faturas de um aluno: filtradas no servidor. A ficha do aluno pedia as 250 mais
 * recentes da escola e filtrava no navegador — as mais antigas do aluno sumiam
 * e o saldo saía errado logo que a escola passava as 250 faturas.
 */
export const listInvoicesInputSchema = z
  .object({
    limit: z.number().int().min(1).max(1000).default(100),
    studentId: z.string().guid().optional(),
  })
  .refine((input) => Boolean(input.studentId) || input.limit <= 250, {
    message: "Sem aluno, a lista vai até 250 faturas.",
    path: ["limit"],
  });

export const recordInvoicePaymentInputSchema = z.object({
  invoiceId: z.string().guid(),
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
  /**
   * Gerada pelo formulário ao abrir e reenviada em cada tentativa: repetir depois
   * de um tempo esgotado devolve o recibo que já entrou em vez de emitir outro.
   */
  idempotencyKey: z.string().uuid().optional(),
});

export type RecordInvoicePaymentInput = z.infer<typeof recordInvoicePaymentInputSchema>;

export const issueInvoiceInputSchema = z.object({
  studentId: z.string().guid(),
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
  cashEntryId: z.string().guid(),
  // 5..300 é o que `finance_receipts_reversal_reason_check` admite, e o mínimo de 5 é
  // também o que `private.reverse_receipt` exige. Com os limites anteriores (3..500), um
  // motivo curto ou longo demais passava a validação e só rebentava na base, com uma
  // mensagem que não dizia ao utilizador o que corrigir. As despesas de caixa não têm
  // restrição própria, pelo que o intervalo mais apertado dos dois serve para ambas.
  reason: z.string().trim().min(5).max(300),
});

export type ReverseCashEntryInput = z.infer<typeof reverseCashEntryInputSchema>;

export const cancelInvoiceInputSchema = z.object({
  invoiceId: z.string().guid(),
  // BD exige 5-300 caracteres quando preenchido (finance_invoices_cancellation_reason_check).
  // Obrigatório: uma fatura anulada sem motivo é o que esconde um desvio.
  reason: z.string().trim().min(5, "Indique o motivo da anulação.").max(300),
});
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceInputSchema>;

export const cancelPaymentPlanInputSchema = z.object({
  planId: z.string().guid(),
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
  invoiceId: z.string().guid().optional(),
  studentId: z.string().guid().optional(),
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
  today = schoolTodayIso(),
): "settled" | "pending" | "overdue" | null {
  if (invoices.length === 0) return null;
  const open = invoices.filter((invoice) => invoice.status !== "paid" && invoice.status !== "void");
  if (open.length === 0) return "settled";
  if (open.some((invoice) => invoice.due_on && invoice.due_on < today)) return "overdue";
  return "pending";
}

export const syncStudentToPayflowInputSchema = z.object({
  studentId: z.string().guid(),
});
export type SyncStudentToPayflowInput = z.infer<typeof syncStudentToPayflowInputSchema>;
