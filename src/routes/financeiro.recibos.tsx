import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listReceipts, type ReceiptSummary } from "@/features/finance/server";
import { kwanza } from "@/lib/currency";

/**
 * Recibos: os comprovativos de liquidação já emitidos.
 *
 * Função própria, como manda o contrato financeiro. Cada linha mostra a origem
 * verificável do documento — número, pagador, factura liquidada, valor, método,
 * data e estado — porque um recibo sem origem rastreável não passa auditoria.
 *
 * Esta página não emite nem anula recibos. A emissão é consequência da
 * liquidação registada na tesouraria, e o estorno pertence à operação que o
 * motiva, com motivo e histórico preservados. Um recibo emitido nunca
 * desaparece: ao ser estornado permanece visível com o motivo à vista.
 */
export const Route = createFileRoute("/financeiro/recibos")({
  head: () => ({
    meta: [
      { title: "Recibos · Finanças · SIGA" },
      {
        name: "description",
        content: "Comprovativos de liquidação emitidos, com factura de origem, método e estado.",
      },
    ],
  }),
  component: ReceiptsPage,
});

const METHOD_LABELS: Record<string, string> = {
  cash: "Numerário",
  transfer: "Transferência",
  multicaixa: "Multicaixa",
  multicaixa_express: "Multicaixa Express",
  express: "Multicaixa Express",
  unitel_money: "Unitel Money",
  deposit: "Depósito",
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

/**
 * Um recibo está emitido ou estornado. O texto e o ícone comunicam o estado
 * sem depender da cor.
 */
function receiptBadge(status: string): { status: string; label: string } {
  if (status === "reversed") return { status: "refunded", label: "Estornado" };
  return { status: "paid", label: "Emitido" };
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-AO");
}

function ReceiptsPage() {
  const [search, setSearch] = useState("");
  const receipts = useQuery({
    queryKey: ["finance", "receipts"],
    queryFn: () => listReceipts({ data: { limit: 250 } }),
    retry: false,
  });

  const rows = useMemo<ReceiptSummary[]>(() => {
    const all = receipts.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((row) =>
      [row.receipt_number, row.student_name, row.student_number, row.invoice_number]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    );
  }, [receipts.data, search]);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças"
          title="Recibos"
          description="Comprovativos de liquidação emitidos. A emissão é consequência do pagamento registado na tesouraria; o estorno preserva o documento e o motivo."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/faturas">Facturas</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro">Caixa e pagamentos</Link>
              </Button>
            </div>
          }
        />

        <Panel
          title="Documentos emitidos"
          description="Pesquise por número de recibo, aluno ou factura de origem."
        >
          <div className="mb-4 max-w-sm">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Número, aluno ou factura…"
              aria-label="Pesquisar recibos"
            />
          </div>

          {receipts.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar recibos…</p>
          ) : receipts.isError ? (
            <p className="text-sm text-destructive">
              {receipts.error instanceof Error
                ? receipts.error.message
                : "Não foi possível carregar os recibos."}
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={
                search.trim()
                  ? "Nenhum recibo nesta pesquisa"
                  : "Ainda não existem recibos emitidos"
              }
              description={
                search.trim()
                  ? "Altere o número, o nome do aluno ou a factura pesquisada."
                  : "Os recibos são emitidos ao registar o pagamento de uma factura na tesouraria."
              }
              compact
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recibo</TableHead>
                    <TableHead>Pagador</TableHead>
                    <TableHead className="hidden md:table-cell">Factura</TableHead>
                    <TableHead className="hidden lg:table-cell">Método</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const badge = receiptBadge(row.status);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.receipt_number || "—"}</TableCell>
                        <TableCell>
                          <span className="block">{row.student_name ?? "—"}</span>
                          {row.student_number ? (
                            <span className="text-xs text-muted-foreground">
                              {row.student_number}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {row.invoice_number ?? "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {methodLabel(row.payment_method)}
                        </TableCell>
                        <TableCell>{formatDate(row.paid_on)}</TableCell>
                        <TableCell>
                          <StatusBadge status={badge.status} label={badge.label} size="sm" />
                          {row.status === "reversed" && row.reversal_reason ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {row.reversal_reason}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {kwanza(row.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
