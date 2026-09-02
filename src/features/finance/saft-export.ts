import type { GenerateSaftInput, SaftInvoiceItem } from "@/features/finance/saft-generator";
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
}): SaftReadinessIssue[] {
  const issues: SaftReadinessIssue[] = [];
  const nif = String(school.nif ?? "").trim();
  const name = String(school.name ?? "").trim();

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
  };
}

export function saftExportBlocked(issues: SaftReadinessIssue[]) {
  return issues.some((issue) => issue.level === "error");
}
