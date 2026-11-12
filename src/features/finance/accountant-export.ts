/**
 * Exportação mensal para o contabilista (decidido a 25/10/2026): a contabilidade oficial da
 * escola faz-se fora do SIGA, num software certificado. O SIGA entrega, por mês, cada
 * documento que a alimenta — faturas emitidas, recibos, estornos e despesas — com número,
 * data, valor e estado, para o contabilista lançar ou importar.
 *
 * São documentos internos do SIGA, não documentos fiscais certificados: a folha «Resumo»
 * di-lo, para ninguém os tomar pelo que não são.
 */

export type AccountantInvoice = {
  invoice_number: string;
  issued_at: string;
  student: string;
  student_number: string;
  item: string;
  competence_month: string | null;
  amount: number;
  discount: number;
  penalty: number;
  status: string;
};

export type AccountantReceipt = {
  receipt_number: string;
  paid_on: string;
  student: string;
  invoice_number: string;
  method: string;
  amount: number;
  status: string;
  external_id: string | null;
};

export type AccountantReversal = {
  receipt_number: string;
  reversed_at: string;
  amount: number;
  reason: string;
};

export type AccountantExpense = {
  document_number: string;
  occurred_at: string;
  category: string;
  description: string;
  method: string;
  amount: number;
  status: string;
};

export type AccountantSheet = {
  name: string;
  columns: Array<{ header: string; width: number; money?: boolean }>;
  rows: Array<Array<string | number>>;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Em aberto",
  partially_paid: "Parcial",
  paid: "Paga",
  cancelled: "Anulada",
  issued: "Emitido",
  reversed: "Estornado",
  posted: "Lançada",
  pending_approval: "Por aprovar",
};

const label = (status: string) => STATUS_LABEL[status] ?? status;
const cents = (value: number) => Math.round(value * 100) / 100;
const day = (iso: string) => iso.slice(0, 10);

/** «2026-10» → limites do mês em Luanda (UTC+1, sem hora de Verão), para filtrar na base. */
export function luandaMonthRange(month: string) {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
  return {
    firstDay: `${month}-01`,
    nextFirstDay: `${next}-01`,
    from: `${month}-01T00:00:00+01:00`,
    to: `${next}-01T00:00:00+01:00`,
  };
}

export function buildAccountantSheets(input: {
  schoolName: string;
  month: string;
  invoices: AccountantInvoice[];
  receipts: AccountantReceipt[];
  reversals: AccountantReversal[];
  expenses: AccountantExpense[];
}): AccountantSheet[] {
  const activeInvoices = input.invoices.filter((row) => row.status !== "cancelled");
  const billed = cents(
    activeInvoices.reduce((sum, row) => sum + row.amount - row.discount + row.penalty, 0),
  );
  const received = cents(input.receipts.reduce((sum, row) => sum + row.amount, 0));
  const reversed = cents(input.reversals.reduce((sum, row) => sum + row.amount, 0));
  const postedExpenses = input.expenses.filter((row) => row.status === "posted");
  const spent = cents(postedExpenses.reduce((sum, row) => sum + row.amount, 0));

  const byMethod = new Map<string, number>();
  for (const row of input.receipts) {
    byMethod.set(row.method, cents((byMethod.get(row.method) ?? 0) + row.amount));
  }
  const byCategory = new Map<string, number>();
  for (const row of postedExpenses) {
    byCategory.set(row.category, cents((byCategory.get(row.category) ?? 0) + row.amount));
  }

  const resumo: AccountantSheet = {
    name: "Resumo",
    columns: [
      { header: "Rubrica", width: 44 },
      { header: "Valor (Kz)", width: 18, money: true },
    ],
    rows: [
      ["Escola", input.schoolName],
      ["Mês", input.month],
      [
        "Natureza",
        "Documentos internos do SIGA, para a contabilidade. Não são documentos fiscais certificados pela AGT.",
      ],
      ["Faturado (líquido de descontos, com multas)", billed],
      ["Recebido (recibos do mês, incluindo os depois estornados)", received],
      ["Estornado no mês", reversed],
      ["Recebido líquido de estornos", cents(received - reversed)],
      ["Despesas lançadas", spent],
      ...[...byMethod.entries()].map(([method, total]) => [`Recebido · ${method}`, total]),
      ...[...byCategory.entries()].map(([category, total]) => [`Despesa · ${category}`, total]),
    ],
  };

  return [
    resumo,
    {
      name: "Faturas",
      columns: [
        { header: "Nº", width: 18 },
        { header: "Data de emissão", width: 14 },
        { header: "Aluno", width: 32 },
        { header: "Nº processo", width: 12 },
        { header: "Item", width: 22 },
        { header: "Mês de referência", width: 14 },
        { header: "Valor", width: 14, money: true },
        { header: "Desconto", width: 12, money: true },
        { header: "Multa", width: 12, money: true },
        { header: "Total", width: 14, money: true },
        { header: "Estado", width: 12 },
      ],
      rows: input.invoices.map((row) => [
        row.invoice_number,
        day(row.issued_at),
        row.student,
        row.student_number,
        row.item,
        row.competence_month ? row.competence_month.slice(0, 7) : "",
        row.amount,
        row.discount,
        row.penalty,
        cents(row.amount - row.discount + row.penalty),
        label(row.status),
      ]),
    },
    {
      name: "Recibos",
      columns: [
        { header: "Nº recibo", width: 18 },
        { header: "Data do pagamento", width: 14 },
        { header: "Aluno", width: 32 },
        { header: "Fatura", width: 18 },
        { header: "Método", width: 22 },
        { header: "Valor", width: 14, money: true },
        { header: "Estado", width: 12 },
        { header: "Referência do fornecedor", width: 26 },
      ],
      rows: input.receipts.map((row) => [
        row.receipt_number,
        day(row.paid_on),
        row.student,
        row.invoice_number,
        row.method,
        row.amount,
        label(row.status),
        row.external_id ?? "",
      ]),
    },
    {
      name: "Estornos",
      columns: [
        { header: "Nº recibo", width: 18 },
        { header: "Data do estorno", width: 14 },
        { header: "Valor", width: 14, money: true },
        { header: "Motivo", width: 40 },
      ],
      rows: input.reversals.map((row) => [
        row.receipt_number,
        day(row.reversed_at),
        row.amount,
        row.reason,
      ]),
    },
    {
      name: "Despesas",
      columns: [
        { header: "Nº documento", width: 18 },
        { header: "Data", width: 12 },
        { header: "Categoria", width: 22 },
        { header: "Descrição", width: 40 },
        { header: "Método", width: 18 },
        { header: "Valor", width: 14, money: true },
        { header: "Estado", width: 12 },
      ],
      rows: input.expenses.map((row) => [
        row.document_number,
        day(row.occurred_at),
        row.category,
        row.description,
        row.method,
        row.amount,
        label(row.status),
      ]),
    },
  ];
}

/** Um livro Excel com uma folha por conjunto; os valores ficam como números, em Kz. */
export async function writeAccountantWorkbook(sheets: AccountantSheet[]) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SIGA";
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((column) => ({ header: column.header, width: column.width }));
    ws.getRow(1).font = { bold: true };
    for (const row of sheet.rows) ws.addRow(row);
    sheet.columns.forEach((column, index) => {
      if (column.money) ws.getColumn(index + 1).numFmt = "#,##0.00";
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
