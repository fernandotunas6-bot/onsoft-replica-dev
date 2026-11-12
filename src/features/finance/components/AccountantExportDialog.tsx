import type { ReactNode } from "react";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { exportAccountantMonth } from "@/features/finance/server";
import { schoolTodayIso } from "@/lib/school-date";
import { toast } from "@/lib/toast";

/** Os últimos 12 meses, o actual primeiro: «2026-10» → «Outubro de 2026». */
export function recentMonths(todayIso: string, count = 12) {
  const [year, month] = todayIso.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, back) => {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    const value = date.toISOString().slice(0, 7);
    const name = date.toLocaleDateString("pt-PT", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return { value, label: name.charAt(0).toUpperCase() + name.slice(1) };
  });
}

function downloadBase64(base64: string, mimeType: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exportação mensal para o contabilista externo: um Excel com as faturas emitidas, os
 * recibos, os estornos e as despesas do mês, um documento por linha.
 */
export function AccountantExportDialog({ trigger }: { trigger: (open: () => void) => ReactNode }) {
  const months = recentMonths(schoolTodayIso());
  return (
    <QuickFormModal
      eyebrow="Contabilidade"
      title="Exportar o mês para o contabilista"
      description="Um Excel com as faturas emitidas, os recibos, os estornos e as despesas do mês, um documento por linha, para o contabilista lançar no software dele. São documentos internos do SIGA, não documentos fiscais certificados."
      submitLabel="Exportar Excel"
      successDescription="Ficheiro exportado."
      fields={[
        {
          name: "mes",
          label: "Mês",
          type: "select",
          options: months,
          defaultValue: months[0]?.value,
          full: true,
        },
      ]}
      onSubmit={async (values) => {
        const result = await exportAccountantMonth({ data: { month: values["mes"] ?? "" } });
        downloadBase64(result.base64, result.mimeType, result.fileName);
        const { invoices, receipts, reversals, expenses } = result.counts;
        toast.success("Exportação para o contabilista", {
          description: `${invoices} faturas, ${receipts} recibos, ${reversals} estornos e ${expenses} despesas.`,
        });
      }}
      trigger={trigger}
    />
  );
}
