import { formatAngolaIban } from "@/lib/angola-banking";
import { kwanza } from "@/lib/currency";
import type { SchoolBankingPrint } from "@/lib/finance-print";

export type ProformaItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number; // e.g. 0 or 14 (%)
};

export type ProformaInvoiceInput = {
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  customerName: string;
  customerNif?: string;
  customerPhone?: string;
  customerEmail?: string;
  studentName?: string;
  registrationNumber?: string;
  className?: string;
  items: ProformaItem[];
  applyRetention?: boolean; // Retenção na fonte (6.5%)
  retentionRate?: number;
  schoolNif?: string;
  banking?: SchoolBankingPrint | null;
};

export type ProformaInvoiceOutput = {
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  customerName: string;
  customerNif: string;
  studentName?: string;
  registrationNumber?: string;
  className?: string;
  items: Array<ProformaItem & { total: number }>;
  subtotal: number;
  taxTotal: number;
  retentionTotal: number;
  netTotal: number;
  formattedSubtotal: string;
  formattedTaxTotal: string;
  formattedRetentionTotal: string;
  formattedNetTotal: string;
  bankingRows: Array<{ label: string; value: string }>;
  agtNotice: string;
};

/**
 * Emite os cálculos e dados estruturados para Fatura Proforma oficial.
 */
export function buildProformaInvoice(input: ProformaInvoiceInput): ProformaInvoiceOutput {
  const itemsWithTotal = input.items.map((item) => ({
    ...item,
    total: item.quantity * item.unitPrice,
  }));

  const subtotal = itemsWithTotal.reduce((acc, item) => acc + item.total, 0);
  const taxTotal = itemsWithTotal.reduce((acc, item) => {
    const rate = item.taxRate ?? 0;
    return acc + (item.total * rate) / 100;
  }, 0);

  const retentionRate = input.applyRetention ? (input.retentionRate ?? 6.5) : 0;
  const retentionTotal = (subtotal * retentionRate) / 100;
  const netTotal = Math.max(0, subtotal + taxTotal - retentionTotal);

  const bankingRows: Array<{ label: string; value: string }> = [];
  if (input.banking?.bank_name)
    bankingRows.push({ label: "Banco", value: input.banking.bank_name });
  if (input.banking?.account_holder)
    bankingRows.push({ label: "Titular", value: input.banking.account_holder });
  if (input.banking?.iban)
    bankingRows.push({ label: "IBAN", value: formatAngolaIban(input.banking.iban) });
  if (input.banking?.multicaixa_merchant) {
    bankingRows.push({ label: "Multicaixa Express", value: input.banking.multicaixa_merchant });
  }

  return {
    documentNumber: input.documentNumber,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    customerName: input.customerName,
    customerNif: input.customerNif || "Consumidor Final",
    ...(input.studentName !== undefined ? { studentName: input.studentName } : {}),
    ...(input.registrationNumber !== undefined
      ? { registrationNumber: input.registrationNumber }
      : {}),
    ...(input.className !== undefined ? { className: input.className } : {}),
    items: itemsWithTotal,
    subtotal,
    taxTotal,
    retentionTotal,
    netTotal,
    formattedSubtotal: kwanza(subtotal),
    formattedTaxTotal: kwanza(taxTotal),
    formattedRetentionTotal: kwanza(retentionTotal),
    formattedNetTotal: kwanza(netTotal),
    bankingRows,
    agtNotice:
      "Esta Proforma não serve de fatura e não quita qualquer pagamento. Válida por 15 dias.",
  };
}

export type AgtReceiptInput = {
  documentNumber: string; // ex: FR SIGA2026/0014
  issueDate: string; // YYYY-MM-DD
  schoolNif: string;
  customerNif?: string;
  amountTotal: number;
  taxTotal?: number;
  hashControl?: string;
};

/**
 * Gera a string de payload de QR Code no padrão AGT Angola.
 * Estrutura AGT: A:NIF_EMITENTE|B:NIF_CLIENTE|C:DATA|D:DOCUMENTO|E:TOTAL|F:IMPOSTO|G:HASH
 */
export function buildAgtQrPayload(input: AgtReceiptInput): string {
  const schoolNif = (input.schoolNif || "999999999").replace(/\D/g, "");
  const customerNif = (input.customerNif || "999999999").replace(/\D/g, "");
  const totalStr = input.amountTotal.toFixed(2);
  const taxStr = (input.taxTotal ?? 0).toFixed(2);
  const hash = input.hashControl || "4K9P";

  return `A:${schoolNif}|B:${customerNif}|C:${input.issueDate}|D:${input.documentNumber}|E:${totalStr}|F:${taxStr}|G:${hash}`;
}

export type ClassTuitionStudentRow = {
  studentId: string;
  fullName: string;
  registrationNumber: string;
  className: string;
  expectedMonthly: number;
  paidAmount: number;
  pendingMonths: number;
  status: "paid" | "partial" | "overdue";
};

export type ClassTuitionSummary = {
  className: string;
  totalStudents: number;
  paidCount: number;
  partialCount: number;
  overdueCount: number;
  totalExpected: number;
  totalCollected: number;
  totalOverdue: number;
  collectionRate: number;
  students: ClassTuitionStudentRow[];
};

/**
 * Consolida o Relatório de Propinas e Proventos por Turma.
 */
export function buildClassTuitionLedger(
  className: string,
  students: ClassTuitionStudentRow[],
): ClassTuitionSummary {
  const totalStudents = students.length;
  const paidCount = students.filter((s) => s.status === "paid").length;
  const partialCount = students.filter((s) => s.status === "partial").length;
  const overdueCount = students.filter((s) => s.status === "overdue").length;

  const totalExpected = students.reduce((acc, s) => acc + s.expectedMonthly, 0);
  const totalCollected = students.reduce((acc, s) => acc + s.paidAmount, 0);
  const totalOverdue = Math.max(0, totalExpected - totalCollected);

  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  return {
    className,
    totalStudents,
    paidCount,
    partialCount,
    overdueCount,
    totalExpected,
    totalCollected,
    totalOverdue,
    collectionRate,
    students,
  };
}
