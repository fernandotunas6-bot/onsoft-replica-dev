import type { Workbook } from "exceljs";
import { safeExcelText } from "./student-ledger-excel";
import { paymentMethodLabel } from "./payment-method";

export type ExportReceiptRow = {
  id: string;
  receiptNumber: string;
  invoiceNumber: string;
  studentNumber: string;
  studentName: string;
  paidOn: string;
  method: string;
  amount: number;
  status: string;
  reversalReason: string;
  externalId: string;
};

export type ReceiptExcelContext = {
  schoolName: string;
  exportedOn: string;
  filterDescription: string;
};

/** Exportação financeira em memória: nunca arredondar através da formatação de texto. */
export async function buildReceiptWorkbook(
  rows: readonly ExportReceiptRow[],
  context: ReceiptExcelContext,
): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "SIGA Plus";
  const sheet = book.addWorksheet("Recibos");
  sheet.columns = [
    { header: "Recibo", key: "number", width: 23 },
    { header: "Fatura", key: "invoice", width: 24 },
    { header: "Processo", key: "studentNumber", width: 20 },
    { header: "Aluno", key: "studentName", width: 38 },
    { header: "Data do pagamento", key: "date", width: 23 },
    { header: "Método", key: "method", width: 25 },
    { header: "Valor (Kz)", key: "amount", width: 22 },
    { header: "Estado", key: "status", width: 20 },
    { header: "Motivo do estorno", key: "reason", width: 42 },
    { header: "Referência externa", key: "external", width: 38 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "J1" };
  sheet.getRow(1).font = { bold: true };

  for (const receipt of rows) {
    sheet.addRow({
      number: safeExcelText(receipt.receiptNumber),
      invoice: safeExcelText(receipt.invoiceNumber),
      studentNumber: safeExcelText(receipt.studentNumber),
      studentName: safeExcelText(receipt.studentName),
      date: receipt.paidOn.slice(0, 10),
      method: safeExcelText(paymentMethodLabel(receipt.method)),
      amount: Math.round(receipt.amount * 100) / 100,
      status: receipt.status === "reversed" ? "Anulado" : "Emitido",
      reason: safeExcelText(receipt.reversalReason),
      external: safeExcelText(receipt.externalId),
    });
  }
  sheet.getColumn("G").numFmt = '#,##0.00 "Kz"';

  const summary = book.addWorksheet("Resumo");
  summary.columns = [{ width: 30 }, { width: 70 }];
  summary.addRow(["Escola", safeExcelText(context.schoolName)]);
  summary.addRow(["Exportação", context.exportedOn]);
  summary.addRow(["Pesquisa", safeExcelText(context.filterDescription)]);
  summary.addRow(["N.º recibos", rows.length]);
  summary.addRow(["Recibos emitidos", rows.filter((row) => row.status !== "reversed").length]);
  summary.addRow(["Recibos anulados", rows.filter((row) => row.status === "reversed").length]);

  const amountInCents = (filter: (row: ExportReceiptRow) => boolean) =>
    rows.filter(filter).reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;

  summary.addRow(["Valor emitido (Kz)", amountInCents((row) => row.status !== "reversed")]);
  summary.addRow(["Valor anulado (Kz)", amountInCents((row) => row.status === "reversed")]);
  summary.addRow([
    "Aviso",
    "Documento interno do SIGA Plus. Os valores anulados são informativos; não equivalem a novas receitas.",
  ]);
  summary.getColumn(1).font = { bold: true };
  summary.getCell("B7").numFmt = '#,##0.00 "Kz"';
  summary.getCell("B8").numFmt = '#,##0.00 "Kz"';
  return book;
}

export async function downloadReceiptWorkbook(
  rows: readonly ExportReceiptRow[],
  context: ReceiptExcelContext,
) {
  const book = await buildReceiptWorkbook(rows, context);
  const bytes = new Uint8Array(await book.xlsx.writeBuffer());
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "SIGA-recibos-" + context.exportedOn + ".xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
