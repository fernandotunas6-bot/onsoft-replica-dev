import { formatAngolaIban } from "@/lib/angola-banking";
import type { PrintSchoolContext } from "@/features/documents/print-catalog";
import type { SchoolSettingsRow } from "@/features/auth/use-school-settings";

export type SchoolBankingPrint = {
  bank_name?: string;
  account_holder?: string;
  iban?: string;
  swift?: string;
  multicaixa_merchant?: string;
};

export function bankingPaymentRows(
  banking?: SchoolBankingPrint | null,
): Array<{ label: string; value: string }> {
  if (!banking) return [];
  const rows: Array<{ label: string; value: string }> = [];
  if (banking.account_holder?.trim()) {
    rows.push({ label: "Titular", value: banking.account_holder.trim() });
  }
  if (banking.bank_name?.trim()) {
    rows.push({ label: "Banco", value: banking.bank_name.trim() });
  }
  if (banking.iban?.trim()) {
    rows.push({ label: "IBAN", value: formatAngolaIban(banking.iban) });
  }
  if (banking.swift?.trim()) {
    rows.push({ label: "SWIFT/BIC", value: banking.swift.trim() });
  }
  if (banking.multicaixa_merchant?.trim()) {
    rows.push({ label: "Multicaixa Express", value: banking.multicaixa_merchant.trim() });
  }
  return rows;
}

export function bankingPaymentSections(banking?: SchoolBankingPrint | null) {
  const rows = bankingPaymentRows(banking);
  if (!rows.length) return [];
  return [{ title: "Dados de pagamento", rows }];
}

export function buildFinancePrintSchool(
  school: SchoolSettingsRow | null | undefined,
  academicYear: string,
): PrintSchoolContext {
  return {
    name: school?.name ?? "Escola",
    nif: school?.nif,
    phone: school?.phone,
    email: school?.email,
    address: school?.address,
    directorName: school?.director_name,
    academicYear,
    logoUrl: school?.branding?.logo_url,
  };
}
