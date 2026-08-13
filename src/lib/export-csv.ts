export type CsvValue = string | number | boolean | null | undefined;

function safeCell(value: CsvValue) {
  const text = value == null ? "" : String(value);
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

export function exportCsv<Row extends object>(
  filename: string,
  columns: ReadonlyArray<{ label: string; value: (row: Row) => CsvValue }>,
  rows: ReadonlyArray<Row>,
) {
  const header = columns.map((column) => safeCell(column.label)).join(";");
  const body = rows.map((row) => columns.map((column) => safeCell(column.value(row))).join(";"));
  const csv = `\uFEFF${[header, ...body].join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
