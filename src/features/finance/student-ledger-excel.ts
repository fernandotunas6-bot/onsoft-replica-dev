import type { Workbook } from "exceljs";
import { studentBalanceState } from "./student-ledger";

/** Excel financeiro: apenas totais confirmados, nunca uma autorização de pagamento. */
export type StudentLedgerExcelRow = {
  studentId: string;
  number: string;
  name: string;
  levelName: string;
  programName: string;
  gradeName: string;
  className: string;
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
  invoiceCount: number;
};

export type StudentLedgerExcelOptions = {
  schoolName: string;
  academicYear: string;
  checkedOn: string;
};

/** Preserva texto digitado por terceiros sem o transformar em fórmula do Excel. */
export function safeExcelText(input: unknown): string {
  const value = String(input ?? "").replace(/\u0000/g, "");
  return /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
}

const money = (value: number) => Math.round(Number(value || 0) * 100) / 100;

export async function buildStudentLedgerWorkbook(
  rows: readonly StudentLedgerExcelRow[],
  options: StudentLedgerExcelOptions,
): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SIGA Plus";
  workbook.created = new Date();

  function addStudentsSheet(name: string, data: readonly StudentLedgerExcelRow[]) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { header: "Processo", key: "number", width: 19 },
      { header: "Aluno", key: "name", width: 38 },
      { header: "Nível", key: "level", width: 19 },
      { header: "Curso", key: "program", width: 23 },
      { header: "Classe", key: "grade", width: 18 },
      { header: "Turma", key: "className", width: 20 },
      { header: "Facturado (Kz)", key: "billed", width: 21 },
      { header: "Pago (Kz)", key: "paid", width: 21 },
      { header: "Dívida (Kz)", key: "outstanding", width: 21 },
      { header: "Vencido (Kz)", key: "overdue", width: 21 },
      { header: "N.º faturas", key: "invoiceCount", width: 14 },
      { header: "Estado", key: "status", width: 19 },
    ];
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "L1" };
    sheet.getRow(1).font = { bold: true };
    for (const row of data) {
      sheet.addRow({
        number: safeExcelText(row.number),
        name: safeExcelText(row.name),
        level: safeExcelText(row.levelName),
        program: safeExcelText(row.programName),
        grade: safeExcelText(row.gradeName),
        className: safeExcelText(row.className),
        billed: money(row.billed),
        paid: money(row.paid),
        outstanding: money(row.outstanding),
        overdue: money(row.overdue),
        invoiceCount: row.invoiceCount,
        status: studentBalanceState(row).label,
      });
    }
    for (const column of ["G", "H", "I", "J"]) {
      sheet.getColumn(column).numFmt = '#,##0.00 "Kz"';
    }
    return sheet;
  }

  addStudentsSheet("Alunos", rows);
  addStudentsSheet("Devedores", rows.filter((row) => row.outstanding > 0));

  const summary = workbook.addWorksheet("Resumo");
  summary.columns = [{ width: 29 }, { width: 52 }];
  const totals = rows.reduce(
    (sum, row) => ({
      billed: sum.billed + Math.round(row.billed * 100),
      paid: sum.paid + Math.round(row.paid * 100),
      outstanding: sum.outstanding + Math.round(row.outstanding * 100),
      overdue: sum.overdue + Math.round(row.overdue * 100),
    }),
    { billed: 0, paid: 0, outstanding: 0, overdue: 0 },
  );
  const meta: Array<[string, string | number]> = [
    ["Escola", safeExcelText(options.schoolName)],
    ["Ano lectivo", safeExcelText(options.academicYear)],
    ["Conferido em", options.checkedOn],
    ["Alunos exportados", rows.length],
    ["Alunos com dívida", rows.filter((row) => row.outstanding > 0).length],
    ["Total facturado (Kz)", totals.billed / 100],
    ["Total pago (Kz)", totals.paid / 100],
    ["Total em dívida (Kz)", totals.outstanding / 100],
    ["Total vencido (Kz)", totals.overdue / 100],
    ["Aviso", "Documento interno do SIGA Plus; não substitui documentação fiscal certificada."],
  ];
  meta.forEach((entry) => summary.addRow(entry));
  summary.getColumn(1).font = { bold: true };
  for (let row = 6; row <= 9; row++) summary.getCell(row, 2).numFmt = '#,##0.00 "Kz"';
  return workbook;
}

/** A exportação ocorre no clique; o ExcelJS é carregado somente quando necessário. */
export async function exportStudentLedgerExcel(
  rows: readonly StudentLedgerExcelRow[],
  options: StudentLedgerExcelOptions,
) {
  const workbook = await buildStudentLedgerWorkbook(rows, options);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "SIGA-financeiro-alunos-" + options.checkedOn + ".xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
