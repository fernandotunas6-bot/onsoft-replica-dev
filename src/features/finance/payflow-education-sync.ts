/**
 * Helpers puros para o contrato SIGA → PayFlow `POST /api/v1/education/sync`.
 * A fonte de verdade académica continua no SIGA; o PayFlow só espelha o necessário para cobrar.
 */

export type PayflowEnrollmentStatus =
  "pending" | "active" | "suspended" | "transferred" | "withdrawn" | "completed" | "cancelled";

export type PayflowInvoiceStatus = "open" | "overdue" | "paid" | "cancelled";

/** Código público do aluno no PayFlow: exactamente 7 dígitos. */
export function toPayflowStudentCode(
  studentNumber: string | null | undefined,
  studentId: string,
): string {
  const digits = String(studentNumber ?? "").replace(/\D/g, "");
  if (digits.length >= 7) return digits.slice(-7);
  if (digits.length > 0) return digits.padStart(7, "0");
  const hex = studentId.replace(/-/g, "").slice(0, 8);
  const n = Number.parseInt(hex, 16) % 10_000_000;
  return String(Number.isFinite(n) ? n : 0).padStart(7, "0");
}

/** PIN estável (6 dígitos) derivado do UUID — re-sync não muda o PIN do portal. */
export function derivePayflowPaymentPin(studentId: string): string {
  const hex = studentId.replace(/-/g, "");
  let acc = 0;
  for (let i = 0; i < hex.length; i += 2) {
    acc = (acc * 31 + Number.parseInt(hex.slice(i, i + 2) || "0", 16)) % 1_000_000;
  }
  return String(acc).padStart(6, "0");
}

export function toPayflowSchoolCode(schoolId: string, schoolName?: string | null): string {
  const fromName = String(schoolName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12);
  if (fromName.length >= 3) return fromName;
  return `SCH${schoolId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function mapEnrollmentStatusToPayflow(
  studentStatus: string | null | undefined,
  enrollmentStatus: string | null | undefined,
): PayflowEnrollmentStatus {
  const status = (enrollmentStatus || studentStatus || "active").toLowerCase();
  if (status === "active") return "active";
  if (status === "applicant" || status === "pending") return "pending";
  if (status === "inactive" || status === "suspended") return "suspended";
  if (status === "transferred") return "transferred";
  if (status === "graduated" || status === "completed") return "completed";
  if (status === "withdrawn") return "withdrawn";
  if (status === "cancelled") return "cancelled";
  return "active";
}

export function mapInvoiceStatusToPayflow(
  status: string,
  dueOn: string | null | undefined,
  today = new Date().toISOString().slice(0, 10),
): PayflowInvoiceStatus {
  const s = status.toLowerCase();
  if (s === "paid") return "paid";
  if (s === "cancelled" || s === "void") return "cancelled";
  if (s === "overdue") return "overdue";
  if (dueOn && dueOn < today && s !== "paid") return "overdue";
  return "open";
}

/** Converte valor em Kz (decimal) para cêntimos / minor units. */
export function kzToMinorUnits(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

/** Converte cêntimos PayFlow para Kz (2 casas). */
export function minorUnitsToKz(amountMinor: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return 0;
  return Math.round(amountMinor) / 100;
}

export type PayflowEducationSyncPayload = {
  school: {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
  };
  student: {
    id: string;
    code: string;
    enrollment_id: string;
    academic_year_id: string;
    class_id: string;
    guardian_id: string | null;
    full_name: string;
    class_name: string;
    enrollment_status: PayflowEnrollmentStatus;
    financial_responsible?: {
      name: string;
      email: string;
      phone: string;
    };
    payment_pin: string;
  };
  invoices: Array<{
    id: string;
    code: string;
    description: string;
    period: string;
    amount: number;
    currency: string;
    due_date: string;
    status: PayflowInvoiceStatus;
  }>;
  bank_accounts: Array<{
    id: string;
    account_holder: string;
    bank_name: string;
    iban: string;
    currency: string;
    status: "active" | "inactive";
    is_primary: boolean;
  }>;
};

export function buildPayflowBankAccount(input: {
  schoolId: string;
  accountHolder: string;
  bankName: string;
  iban: string;
  currency?: string;
}): PayflowEducationSyncPayload["bank_accounts"][number] | null {
  const iban = input.iban.trim().toUpperCase().replace(/\s/g, "");
  const holder = input.accountHolder.trim();
  const bank = input.bankName.trim();
  if (!iban || !holder || !bank) return null;
  return {
    id: `ba_${input.schoolId.replace(/-/g, "").slice(0, 24)}`,
    account_holder: holder.slice(0, 160),
    bank_name: bank.slice(0, 120),
    iban,
    currency: (input.currency || "AOA").toUpperCase(),
    status: "active",
    is_primary: true,
  };
}
