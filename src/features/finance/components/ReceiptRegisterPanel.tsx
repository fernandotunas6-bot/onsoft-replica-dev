import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { reverseCashEntry } from "../server";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { ListPaginationBar } from "@/components/filters/ListPaginationBar";
import { ResponsiveEntityView } from "@/components/mobile/ResponsiveEntityView";
import { EntityListSkeleton } from "@/components/mobile/skeletons";
import { MobileErrorState } from "@/components/mobile/states";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { overlayServico } from "@/features/documents/print-overlays";
import { stableDocumentCode } from "@/features/arquivos/document-code";
import { officialReceiptBody } from "@/features/finance/schemas";
import { paymentMethodLabel } from "@/features/finance/payment-method";
import { buildFinancePrintSchool } from "@/lib/finance-print";
import { exportCsv } from "@/lib/export-csv";
import { kwanza } from "@/lib/currency";
import { toast } from "@/lib/toast";
import { listReceiptRegister } from "../receipt-register-server";
import { AccountantExportDialog } from "./AccountantExportDialog";
import { downloadReceiptWorkbook, type ExportReceiptRow } from "../receipt-register-excel";
import { schoolTodayIso } from "@/lib/school-date";

const emptyFilters = {
  receiptNumber: "",
  invoiceNumber: "",
  studentQuery: "",
  status: "all",
  method: "all",
  from: "",
  to: "",
};

export function ReceiptRegisterPanel() {
  const { school, selectedYearLabel } = useSchoolSettings();
  const account = useCurrentAccount();
  const canReverse = account.role === "Administrador" || account.role === "Tesouraria";
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const query = useQuery({
    queryKey: ["finance", "receipt-register", school?.id, filters, page],
    queryFn: () => listReceiptRegister({
      data: { ...filters, page, pageSize: 25 },
    }),
    enabled: Boolean(school?.id),
    staleTime: 15_000,
    retry: false,
  });
  const entries = query.data?.rows ?? [];
  type Receipt = (typeof entries)[number];
  const printSchool = buildFinancePrintSchool(
    school,
    selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
  );

  const exportFilteredExcel = async () => {
    const initialTotal = query.data?.total ?? 0;
    if (initialTotal === 0 || exporting) return;
    const MAX_EXPORT = 2000;
    if (initialTotal > MAX_EXPORT) {
      toast.error(
        "Esta pesquisa tem mais de 2 000 recibos. Refine os filtros antes de exportar.",
      );
      return;
    }
    setExporting(true);
    setExportProgress(0);
    try {
      const rows: ExportReceiptRow[] = [];
      const pageSize = 100;
      const pages = Math.ceil(initialTotal / pageSize);
      for (let current = 1; current <= pages; current++) {
        const result = await listReceiptRegister({
          data: { ...filters, page: current, pageSize },
        });
        if (result.total !== initialTotal) {
          throw new Error("Os recibos foram actualizados durante a exportação. Repita a operação.");
        }
        rows.push(...result.rows);
        setExportProgress(rows.length);
      }
      if (rows.length !== initialTotal) {
        throw new Error("A exportação ficou incompleta; nenhum ficheiro foi criado.");
      }
      await downloadReceiptWorkbook(rows, {
        schoolName: school?.name ?? "Escola",
        exportedOn: schoolTodayIso(),
        filterDescription: [
          filters.receiptNumber && "Recibo: " + filters.receiptNumber,
          filters.invoiceNumber && "Fatura: " + filters.invoiceNumber,
          filters.studentQuery && "Aluno: " + filters.studentQuery,
          filters.status !== "all" && "Estado: " + filters.status,
          filters.method !== "all" && "Método: " + filters.method,
          filters.from && "Desde: " + filters.from,
          filters.to && "Até: " + filters.to,
        ].filter(Boolean).join("; ") || "Todos os recibos desta escola",
      });
      toast.success("Excel de " + rows.length + " recibos exportado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível exportar os recibos.",
      );
    } finally {
      setExportProgress(0);
      setExporting(false);
    }
  };

  /** A anulação usa o mesmo RPC protegido da tesouraria, sem apagar o histórico. */
  const reversalControl = (receipt: Receipt) =>
    canReverse && receipt.status !== "reversed" ? (
      <QuickFormModal
        eyebrow="Tesouraria"
        title={"Anular recibo " + receipt.receiptNumber}
        description={
          "Esta operação estorna o recebimento e devolve a dívida à fatura. " +
          "O recibo original permanece no histórico. Exige autorização financeira e 2FA."
        }
        submitLabel="Confirmar anulação"
        fields={[
          {
            name: "motivo",
            label: "Motivo da anulação",
            type: "textarea",
            required: true,
            full: true,
            placeholder: "Descreva o motivo da anulação (5 a 300 caracteres)",
          },
        ]}
        onSubmit={async (values) => {
          const reason = (values["motivo"] ?? "").trim();
          if (reason.length < 5 || reason.length > 300) {
            throw new Error("O motivo deve ter entre 5 e 300 caracteres.");
          }
          await reverseCashEntry({ data: { cashEntryId: receipt.id, reason } });
          await queryClient.invalidateQueries({ queryKey: ["finance"] });
          toast.success("Recibo anulado. O histórico foi preservado.");
        }}
        trigger={(open) => (
          <Button size="sm" variant="outline" onClick={open}>
            Anular
          </Button>
        )}
      />
    ) : null;

  const printReceipt = async (receipt: Receipt) => {
    if (printing) return;
    setPrinting(receipt.id);
    try {
      await issuePrintDocument({
        tipo: "Recibo de pagamento",
        school: printSchool,
        student: {
          fullName: receipt.studentName,
          academicNumber: receipt.studentNumber || "—",
          documentTitle: receipt.receiptNumber,
          validationCode: stableDocumentCode("recibo", receipt.id),
        },
        overlay: overlayServico({
          name: "Recibo de pagamento",
          reference: receipt.receiptNumber,
          status: receipt.status === "reversed" ? "Anulado" : "Emitido",
          parties: [
            { label: "Escola", value: school?.name ?? "Escola" },
            { label: "Aluno", value: receipt.studentName },
            { label: "Processo", value: receipt.studentNumber || "—" },
          ],
          sections: [{
            title: "Liquidação",
            rows: [
              { label: "Fatura", value: receipt.invoiceNumber },
              { label: "Recibo", value: receipt.receiptNumber },
              { label: "Valor", value: kwanza(receipt.amount) },
              { label: "Data", value: receipt.paidOn.slice(0, 10) || "—" },
              { label: "Método", value: paymentMethodLabel(receipt.method) },
              ...(receipt.reversalReason
                ? [{ label: "Motivo da anulação", value: receipt.reversalReason }]
                : []),
            ],
          }],
          term: receipt.status === "reversed" ? "Recibo anulado — não comprova liquidação." : officialReceiptBody({
            schoolName: school?.name ?? "Escola",
            studentName: receipt.studentName,
            invoiceNumber: receipt.invoiceNumber,
            receiptNumber: receipt.receiptNumber,
            amountLabel: kwanza(receipt.amount),
          }),
        }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o recibo.");
    } finally {
      setPrinting(null);
    }
  };

  return (
    <Panel title="Pesquisar recibos" description="Recibos emitidos e anulados nesta escola; consulta e reimpressão dos documentos registados.">
      <div className="space-y-3">
        <ListFilterBar
          values={filters}
          activeCount={Object.entries(filters).filter(([, value]) => value && value !== "all").length}
          onChange={(key, value) => {
            setFilters((previous) => ({ ...previous, [key]: value }));
            setPage(1);
          }}
          onReset={() => {
            setFilters(emptyFilters);
            setPage(1);
          }}
          fields={[
            { name: "receiptNumber", placeholder: "Número do recibo…", "aria-label": "Pesquisar recibo" },
            { name: "invoiceNumber", placeholder: "Número exacto da fatura…", "aria-label": "Pesquisar fatura" },
            { name: "studentQuery", placeholder: "Nome ou processo do aluno…", "aria-label": "Pesquisar estudante" },
            { name: "status", type: "select", label: "Estado", options: [
              { value: "all", label: "Todos" },
              { value: "issued", label: "Emitidos" },
              { value: "reversed", label: "Anulados" },
            ] },
            { name: "method", type: "select", label: "Método", options: [
              { value: "all", label: "Todos os métodos" },
              { value: "cash", label: "Numerário" },
              { value: "bank_transfer", label: "Transferência" },
              { value: "card", label: "TPA / Multicaixa" },
              { value: "other", label: "Outros" },
            ] },
            { name: "from", type: "date", label: "De" },
            { name: "to", type: "date", label: "Até" },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 text-sm">
          <span aria-live="polite">
            {query.isLoading ? "A carregar…" : String(query.data?.total ?? 0) + " recibos encontrados"}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
              Actualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!entries.length || query.isFetching}
              onClick={() => exportCsv(
                "recibos-pagina-" + page,
                [
                  { label: "Número", value: (r: Receipt) => r.receiptNumber },
                  { label: "Fatura", value: (r: Receipt) => r.invoiceNumber },
                  { label: "Aluno", value: (r: Receipt) => r.studentName },
                  { label: "Processo", value: (r: Receipt) => r.studentNumber },
                  { label: "Data", value: (r: Receipt) => r.paidOn },
                  { label: "Método", value: (r: Receipt) => paymentMethodLabel(r.method) },
                  { label: "Valor (Kz)", value: (r: Receipt) => r.amount },
                  { label: "Estado", value: (r: Receipt) => r.status === "reversed" ? "Anulado" : "Emitido" },
                ],
                entries,
              )}
            >
              Exportar página CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!query.data?.total || query.isFetching || exporting}
              onClick={() => void exportFilteredExcel()}
            >
              {exporting
                ? "A exportar " + exportProgress + "/" + (query.data?.total ?? 0) + "…"
                : "Exportar filtrados Excel"}
            </Button>
            <AccountantExportDialog
              trigger={(open) => (
                <Button variant="outline" size="sm" onClick={open}>
                  Exportar mês completo Excel
                </Button>
              )}
            />
          </div>
        </div>
        {query.isLoading ? (
          <EntityListSkeleton rows={4} />
        ) : query.isError ? (
          <MobileErrorState
            what="os recibos"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : !entries.length ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Nenhum recibo encontrado. Altere os filtros ou procure outro número.
          </p>
        ) : (
          <ResponsiveEntityView
            mobile={
              <ul className="space-y-2 p-3" aria-label="Recibos da escola">
                {entries.map((receipt) => (
                  <li key={receipt.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{receipt.receiptNumber}</p>
                        <p className="text-xs text-muted-foreground">{receipt.studentName}</p>
                        <p className="text-xs text-muted-foreground">{receipt.paidOn.slice(0, 10)} · {paymentMethodLabel(receipt.method)}</p>
                      </div>
                      <span className="text-sm font-semibold">{kwanza(receipt.amount)}</span>
                    </div>
                    <p className="mt-2 text-xs">{receipt.status === "reversed" ? "Anulado" : "Emitido"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={Boolean(printing)} onClick={() => void printReceipt(receipt)}>
                        Imprimir / PDF
                      </Button>
                      {reversalControl(receipt)}
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/faturas/$invoiceId" params={{ invoiceId: receipt.invoiceId }}>Ver fatura</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            }
            desktop={
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Registo de recibos da escola</caption>
                  <thead>
                    <tr className="border-b border-border">
                      {["Recibo", "Fatura", "Aluno", "Data", "Método", "Valor", "Estado", "Acções"].map((head) => (
                        <th key={head} scope="col" className="p-3 font-medium">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((receipt) => (
                      <tr key={receipt.id} className="border-b border-border">
                        <td className="p-3 whitespace-nowrap font-medium">{receipt.receiptNumber}</td>
                        <td className="p-3">
                          <Link to="/faturas/$invoiceId" params={{ invoiceId: receipt.invoiceId }} className="text-primary hover:underline">
                            {receipt.invoiceNumber}
                          </Link>
                        </td>
                        <td className="p-3">{receipt.studentName}</td>
                        <td className="p-3 whitespace-nowrap">{receipt.paidOn.slice(0, 10)}</td>
                        <td className="p-3">{paymentMethodLabel(receipt.method)}</td>
                        <td className="p-3 whitespace-nowrap tabular-nums">{kwanza(receipt.amount)}</td>
                        <td className="p-3">{receipt.status === "reversed" ? "Anulado" : "Emitido"}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" disabled={Boolean(printing)} onClick={() => void printReceipt(receipt)}>
                              Imprimir / PDF
                            </Button>
                            {reversalControl(receipt)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />
        )}
        <ListPaginationBar
          page={page}
          pageSize={25}
          totalItems={query.data?.total ?? 0}
          onPageChange={setPage}
        />
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          A exportação dos resultados filtrados inclui até 2 000 recibos por operação; acima disso, refine os filtros. CSV contém apenas os recibos desta página. Para exportar todos os documentos contabilísticos do mês,
          utilize a exportação mensal do contabilista. Os recibos anulados permanecem no histórico.
          Estes documentos internos não substituem faturas fiscais certificadas.
        </p>
      </div>
    </Panel>
  );
}
