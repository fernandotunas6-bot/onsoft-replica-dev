import type { OfficialPautaMeta, PdfValue } from "./export-pdf";

type PdfColumn<Row extends object> = {
  label: string;
  value: (row: Row) => PdfValue;
};

let pdfExporter: Promise<typeof import("./export-pdf")> | undefined;

function loadPdfExporter() {
  pdfExporter ??= import("./export-pdf");
  return pdfExporter;
}

/** Carrega jsPDF apenas quando o utilizador pede um ficheiro PDF. */
export async function exportPdfTable<Row extends object>(
  filename: string,
  title: string,
  columns: ReadonlyArray<PdfColumn<Row>>,
  rows: ReadonlyArray<Row>,
  subtitle?: string,
) {
  const exporter = await loadPdfExporter();
  exporter.exportPdfTable(filename, title, columns, rows, subtitle);
}

export async function exportOfficialPautaPdf<Row extends object>(
  filename: string,
  title: string,
  meta: OfficialPautaMeta,
  columns: ReadonlyArray<PdfColumn<Row>>,
  rows: ReadonlyArray<Row>,
) {
  const exporter = await loadPdfExporter();
  await exporter.exportOfficialPautaPdf(filename, title, meta, columns, rows);
}

export async function exportOfficialDeclarationPdf(
  filename: string,
  title: string,
  meta: OfficialPautaMeta & {
    studentName: string;
    registrationNumber: string;
    body: string;
  },
) {
  const exporter = await loadPdfExporter();
  await exporter.exportOfficialDeclarationPdf(filename, title, meta);
}
