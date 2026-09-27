import { Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCsv } from "@/lib/export-csv";
import { exportPdfTable } from "@/lib/export-pdf-loader";
import type { ExportColumn } from "./analytics-export";

/** Botões discretos de CSV e PDF para o cabeçalho de um painel. */
export function PanelExportButtons<Row extends object>({
  filename,
  title,
  subtitle,
  columns,
  rows,
}: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn<Row>[];
  rows: Row[];
}) {
  const disabled = rows.length === 0;
  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 text-xs text-muted-foreground"
        disabled={disabled}
        aria-label={`Exportar ${title} em CSV`}
        onClick={() => exportCsv(filename, columns, rows)}
      >
        <Download className="size-3.5" /> CSV
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 text-xs text-muted-foreground"
        disabled={disabled}
        aria-label={`Exportar ${title} em PDF`}
        onClick={() => void exportPdfTable(filename, title, columns, rows, subtitle)}
      >
        <FileDown className="size-3.5" /> PDF
      </Button>
    </div>
  );
}
