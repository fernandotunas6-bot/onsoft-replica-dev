// Módulo server-only: exceljs/papaparse não devem ir para o bundle do
// cliente. Este ficheiro só é importado dinamicamente a partir de server
// functions (ver import/server.ts), nunca de um ficheiro de rota ou
// componente — por isso os imports abaixo podem ser estáticos.
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { isBlankRow, normalizeText } from "./normalize";

export type ParsedSheet = {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
};

export type ParsedFile = {
  sheets: ParsedSheet[];
};

const MAX_ROWS_PER_SHEET = 25_000;

export async function parseImportFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) {
    return { sheets: [parseCsvSheet(buffer, "Sheet1")] };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    return parseXlsxBuffer(buffer);
  }
  if (lower.endsWith(".xls")) {
    throw new Error(
      "O formato .xls (Excel 97-2003) não é suportado por agora. Grave o ficheiro como .xlsx ou .csv e volte a carregar.",
    );
  }
  throw new Error("Formato de ficheiro não suportado. Use .xlsx ou .csv.");
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  // exceljs empacota um .d.ts compilado contra uma versão mais antiga de
  // @types/node cujo `Buffer` não é genérico — mesmo tipo em runtime, só a
  // declaração de tipos diverge entre versões.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheets: ParsedSheet[] = [];
  workbook.eachSheet((worksheet) => {
    if (worksheet.state === "hidden" || worksheet.state === "veryHidden") return;
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber - 1] = normalizeText(cellToPrimitive(cell.value));
    });
    const cleanHeaders = headers.map((h, idx) => h || `Coluna ${idx + 1}`);
    if (cleanHeaders.length === 0) return;

    const rows: Record<string, unknown>[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rn) => {
      if (rn === 1) return;
      if (rows.length >= MAX_ROWS_PER_SHEET) return;
      const obj: Record<string, unknown> = {};
      cleanHeaders.forEach((header, idx) => {
        const cell = row.getCell(idx + 1);
        obj[header] = cellToPrimitive(cell.value);
      });
      if (!isBlankRow(obj)) rows.push(obj);
    });

    sheets.push({ name: worksheet.name, headers: cleanHeaders, rows });
  });

  return { sheets };
}

function cellToPrimitive(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("richText" in v && Array.isArray(v["richText"])) {
      return (v["richText"] as Array<{ text?: string }>).map((t) => t.text ?? "").join("");
    }
    if ("text" in v && "hyperlink" in v) return v["text"];
    if ("result" in v) return v["result"];
    if ("error" in v) return null;
  }
  return value;
}

function parseCsvSheet(buffer: Buffer, sheetName: string): ParsedSheet {
  const text = decodeCsvText(buffer);
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => normalizeText(h),
  });
  const headers = (parsed.meta.fields ?? []).map((h) => normalizeText(h));
  const rows = (parsed.data ?? [])
    .filter((row) => !isBlankRow(row))
    .slice(0, MAX_ROWS_PER_SHEET);
  return { name: sheetName, headers, rows };
}

function decodeCsvText(buffer: Buffer): string {
  // UTF-8 BOM (comum em exports do Excel PT/AO) ou UTF-8 simples.
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf-8");
  }
  return buffer.toString("utf-8");
}
