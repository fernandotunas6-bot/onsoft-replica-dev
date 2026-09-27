import type {
  GenerateSaftInput,
  SaftInvoiceItem,
  SaftPaymentItem,
} from "@/features/finance/saft-generator";
import { validateSchoolNif } from "@/lib/angola-identity";

export type SaftReadinessIssue = {
  level: "error" | "warn";
  message: string;
};

export function saftPeriodBounds(input: GenerateSaftInput) {
  const year = input.fiscalYear;
  return {
    start: input.startDate ?? `${year}-01-01`,
    end: input.endDate ?? `${year}-12-31`,
  };
}

export function invoiceDateInSaftPeriod(date: string, start: string, end: string) {
  const value = date.slice(0, 10);
  return value >= start && value <= end;
}

export function validateSaftSchoolReadiness(school: {
  nif?: string | null;
  name?: string | null;
  address?: string | null;
}): SaftReadinessIssue[] {
  const issues: SaftReadinessIssue[] = [];
  const nif = String(school.nif ?? "").trim();
  const name = String(school.name ?? "").trim();

  if (!String(school.address ?? "").trim()) {
    issues.push({
      level: "warn",
      message: 'Morada da escola em falta — o ficheiro leva "Desconhecido" (Definições → Escola).',
    });
  }

  if (!name) {
    issues.push({
      level: "warn",
      message: "Nome da escola em falta — preencha em Definições → Escola.",
    });
  }

  if (!nif) {
    issues.push({
      level: "error",
      message: "NIF da escola em falta — obrigatório para SAFT-AO (Definições → Escola).",
    });
    return issues;
  }

  const nifCheck = validateSchoolNif(nif);
  if (!nifCheck.ok) {
    issues.push({
      level: "error",
      message: nifCheck.error ?? "NIF da escola inválido para AGT.",
    });
  }

  if (nif === "999999999") {
    issues.push({
      level: "error",
      message: "NIF placeholder detectado — configure o NIF real da escola.",
    });
  }

  return issues;
}

export function mapFinanceInvoiceToSaftItem(input: {
  id: string;
  invoice_number: string;
  created_at: string | null;
  amount: number;
  discount_amount: number;
  status: string;
  cancelled_at?: string | null;
  description: string;
  customerName: string;
  customerNif?: string | null;
  studentId?: string | null;
  fiscalYear: number;
}): SaftInvoiceItem {
  const total = Number(input.amount ?? 0) - Number(input.discount_amount ?? 0);
  const date = input.created_at?.slice(0, 10) ?? `${input.fiscalYear}-01-01`;
  return {
    id: input.id,
    invoiceNo: input.invoice_number || `FT ${input.fiscalYear}/${input.id.slice(0, 4)}`,
    invoiceType: "FT",
    date,
    customerName: input.customerName,
    customerNif: input.customerNif ?? null,
    studentId: input.studentId ?? undefined,
    description: input.description,
    amount: total,
    status: input.status === "cancelled" ? "A" : "N",
    ...(input.status === "cancelled" && input.cancelled_at
      ? { statusDate: input.cancelled_at.slice(0, 10) }
      : {}),
  };
}

/** Recibo (finance_receipts) → pagamento SAF-T; estornado = anulado. */
export function mapFinanceReceiptToSaftPayment(input: {
  id: string;
  receipt_number: string | null;
  paid_on: string | null;
  created_at: string | null;
  amount: number;
  status: string;
  reversed_at?: string | null;
  payment_method?: string | null;
  customerName: string;
  customerNif?: string | null;
  studentId?: string | null;
  sourceInvoiceNo?: string | null;
  sourceInvoiceDate?: string | null;
  description?: string | null;
}): SaftPaymentItem {
  const date = (input.paid_on ?? input.created_at ?? "").slice(0, 10);
  const reversed = input.status === "reversed";
  return {
    id: input.id,
    paymentRefNo: input.receipt_number || `RG ${date.slice(0, 4)}/${input.id.slice(0, 8)}`,
    paymentType: "RG",
    date,
    customerName: input.customerName,
    customerNif: input.customerNif ?? null,
    studentId: input.studentId ?? undefined,
    description: input.description ?? undefined,
    amount: Number(input.amount ?? 0),
    ...(input.sourceInvoiceNo ? { sourceInvoiceNo: input.sourceInvoiceNo } : {}),
    ...(input.sourceInvoiceDate ? { sourceInvoiceDate: input.sourceInvoiceDate.slice(0, 10) } : {}),
    status: reversed ? "A" : "N",
    ...(reversed && input.reversed_at ? { statusDate: input.reversed_at.slice(0, 10) } : {}),
  };
}

/**
 * Aviso sempre presente: o SIGA não assina as faturas com chave da AGT, por isso
 * o ficheiro serve para conferência e para o contabilista, não como SAF-T de
 * software certificado.
 */
export function saftCertificationWarning(certificateNumber?: string) {
  return certificateNumber
    ? `Documentos sem assinatura digital (Hash 0): o SIGA não assina faturas com a chave da AGT, mesmo com o certificado ${certificateNumber} indicado nas definições.`
    : "Ficheiro para conferência: o SIGA não é software de facturação certificado pela AGT (certificado 0, documentos sem assinatura).";
}

export function saftExportBlocked(issues: SaftReadinessIssue[]) {
  return issues.some((issue) => issue.level === "error");
}
