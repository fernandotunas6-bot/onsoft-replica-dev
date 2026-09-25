import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Landmark } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getFinanceReporting, listCashEntries, listInvoices } from "@/features/finance/server";
import { cn } from "@/lib/utils";
import { AppyPayPanel, ChargeInvoiceButton, useAppyPayStatus } from "@/features/finance/AppyPayPanel";

export const Route = createFileRoute("/tesouraria")({
  head: () => ({
    meta: [
      { title: "Tesouraria · SIGA Plus" },
      {
        name: "description",
        content: "Fluxo de caixa, facturas pendentes e relatórios financeiros da tesouraria.",
      },
      { property: "og:title", content: "Tesouraria · SIGA Plus" },
      {
        property: "og:description",
        content: "Fluxo de caixa, facturas pendentes e relatórios financeiros.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TreasuryPage,
});

const kz = (n: number) =>
  `${new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(Math.round(n || 0))} Kz`;

function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15`).toLocaleDateString("pt-AO", { month: "short", year: "2-digit" });

function TreasuryPage() {
  const reporting = useQuery({
    queryKey: ["tesouraria", "reporting"],
    queryFn: () => getFinanceReporting(),
    retry: false,
  });
  const invoices = useQuery({
    queryKey: ["tesouraria", "invoices"],
    queryFn: () => listInvoices({ data: { limit: 250 } }),
    retry: false,
  });
  const cash = useQuery({
    queryKey: ["tesouraria", "cash"],
    queryFn: () => listCashEntries({ data: { limit: 250 } }),
    retry: false,
  });
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const appy = useAppyPayStatus();
  const canCharge = Boolean(appy.data?.configured);

  const summary = reporting.data?.summary;
  const monthly = reporting.data?.monthly ?? [];
  const maxMonth = Math.max(1, ...monthly.map((m) => Math.max(m.received, m.expense)));
  const today = new Date().toISOString().slice(0, 10);

  const pending = useMemo(() => {
    const list = (invoices.data ?? [])
      .filter((i) => i.status !== "paid" && i.status !== "void" && i.status !== "cancelled")
      .map((i) => ({
        ...i,
        balance: Math.max(0, i.total_amount - i.amount_paid),
        overdue: Boolean(i.due_on && i.due_on < today),
      }))
      .filter((i) => i.balance > 0 && (!onlyOverdue || i.overdue));
    return list.sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));
  }, [invoices.data, onlyOverdue, today]);

  const error = reporting.error ?? invoices.error ?? cash.error;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Financeiro"
          title="Tesouraria"
          description="Fluxo de caixa, facturas por cobrar e relatórios. Acesso reservado à tesouraria."
          icon={Landmark}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {(error as Error).message}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Saldo de caixa", value: summary?.cash_balance },
            { label: "Entradas", value: summary?.cash_in },
            { label: "Saídas", value: summary?.cash_out },
            { label: "Por cobrar (em atraso)", value: summary?.overdue },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {reporting.isLoading ? "…" : kz(Number(k.value ?? 0))}
              </p>
            </div>
          ))}
        </div>

        <Panel
          title="Fluxo de caixa mensal"
          description="Recebido e gasto em cada mês."
          action={
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={!monthly.length}
              onClick={() =>
                downloadCsv("fluxo-de-caixa.csv", [
                  ["Mês", "Facturado", "Recebido", "Despesas", "Saldo do mês"],
                  ...monthly.map((m) => [
                    m.month_start.slice(0, 7),
                    m.billed,
                    m.received,
                    m.expense,
                    m.received - m.expense,
                  ]),
                ])
              }
            >
              <Download className="size-4" /> Exportar
            </Button>
          }
        >
          {monthly.length === 0 ? (
            <EmptyState title="Sem movimentos" description="Ainda não há movimentos de caixa." />
          ) : (
            <div className="space-y-2">
              {monthly.map((m) => (
                <div key={m.month_start} className="grid grid-cols-[4rem_1fr_7rem] items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{monthLabel(m.month_start)}</span>
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(m.received / maxMonth) * 100}%` }} />
                    <div className="h-2 rounded-full bg-destructive/70" style={{ width: `${(m.expense / maxMonth) * 100}%` }} />
                  </div>
                  <span
                    className={cn(
                      "text-right font-medium",
                      m.received - m.expense < 0 ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {kz(m.received - m.expense)}
                  </span>
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">
                Barra superior: recebido · barra inferior: despesas · à direita: saldo do mês.
              </p>
            </div>
          )}
        </Panel>

        <Panel
          title="Facturas pendentes"
          description={`${pending.length} facturas · ${kz(pending.reduce((s, i) => s + i.balance, 0))} por receber (entre as 250 facturas mais recentes; o total geral está no cartão acima)`}
          action={
            <div className="flex gap-2">
              <Button variant={onlyOverdue ? "default" : "outline"} size="sm" onClick={() => setOnlyOverdue((v) => !v)}>
                {onlyOverdue ? "Todas" : "Só em atraso"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!pending.length}
                onClick={() =>
                  downloadCsv("facturas-pendentes.csv", [
                    ["Factura", "Aluno", "Processo", "Descrição", "Vencimento", "Total", "Pago", "Em dívida"],
                    ...pending.map((i) => [
                      i.number,
                      i.student_name,
                      i.registration_number,
                      i.description,
                      i.due_on ?? "",
                      i.total_amount,
                      i.amount_paid,
                      i.balance,
                    ]),
                  ])
                }
              >
                <Download className="size-4" /> Exportar
              </Button>
            </div>
          }
        >
          {invoices.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : pending.length === 0 ? (
            <EmptyState title="Nada por cobrar" description="Não há facturas pendentes." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Factura</th>
                    <th className="py-2 pr-3">Aluno</th>
                    <th className="py-2 pr-3">Vencimento</th>
                    <th className="py-2 text-right">Em dívida</th>
                    {canCharge ? <th className="py-2 pl-3" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {pending.slice(0, 100).map((i) => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-mono text-xs">{i.number}</td>
                      <td className="py-2 pr-3">{i.student_name}</td>
                      <td className={cn("py-2 pr-3", i.overdue && "text-destructive")}>
                        {i.due_on ?? "—"}
                        {i.overdue ? " · em atraso" : ""}
                      </td>
                      <td className="py-2 text-right font-medium">{kz(i.balance)}</td>
                      {canCharge ? (
                        <td className="py-2 pl-3 text-right">
                          <ChargeInvoiceButton invoiceId={i.id} studentName={i.student_name} balance={i.balance} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <AppyPayPanel />

        <Panel
          title="Últimos movimentos de caixa"
          action={
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={!cash.data?.length}
              onClick={() =>
                downloadCsv("extracto-caixa.csv", [
                  ["Data", "Documento", "Descrição", "Categoria", "Método", "Entrada", "Saída", "Estado"],
                  ...(cash.data ?? []).map((c) => [
                    c.occurred_at.slice(0, 10),
                    c.document_number,
                    c.description,
                    c.category,
                    c.method,
                    c.direction === "in" ? c.amount : "",
                    c.direction === "out" ? c.amount : "",
                    c.status === "reversed" ? "Anulado" : "Lançado",
                  ]),
                ])
              }
            >
              <Download className="size-4" /> Extracto
            </Button>
          }
        >
          {cash.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : !cash.data?.length ? (
            <EmptyState title="Sem movimentos" description="Ainda não há movimentos de caixa." />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {cash.data.slice(0, 30).map((c) => (
                <li key={`${c.direction}-${c.id}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className={cn("truncate", c.status === "reversed" && "line-through text-muted-foreground")}>
                      {c.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.occurred_at.slice(0, 10)} · {c.document_number} · {c.category}
                    </p>
                  </div>
                  <span className={cn("shrink-0 font-medium", c.direction === "out" ? "text-destructive" : "text-foreground")}>
                    {c.direction === "out" ? "−" : "+"}
                    {kz(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
