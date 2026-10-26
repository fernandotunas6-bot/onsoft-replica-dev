import { useMemo, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { getInvoiceDetail } from "@/features/finance/server";
import type { InvoiceDetail } from "@/features/finance/invoice-detail";
import { paymentMethodLabel } from "@/features/finance/payment-method";
import { formatIsoDay } from "@/features/finance/student-finance-summary";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { canReadStudentSection } from "@/features/students/student-sections";
import { moduleIcons } from "@/lib/app-icons";
import { kwanza } from "@/lib/currency";
import { publicErrorMessage } from "@/lib/public-error";

/**
 * Página da fatura (SIGA Context Engine, contexto financeiro): os dados da fatura,
 * o aluno a quem foi emitida e os pagamentos e recibos que a liquidam. A fatura só
 * aparece se o servidor a devolver na escola activa (`getInvoiceDetail`); receber e
 * anular continuam na lista de faturas.
 */
export const Route = createFileRoute("/faturas_/$invoiceId")({
  head: () => ({ meta: [{ title: "Fatura · SIGA" }] }),
  component: InvoicePage,
});

/** Como `/faturas`: Administração e Tesouraria (e outro cargo com permissão). */
function useCanOpenInvoices() {
  const account = useCurrentAccount();
  return canAccessPath("/faturas", account.role, account.grants);
}

function monthLabel(month: string | null) {
  if (!month) return "—";
  const [y, m] = month.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return Number.isNaN(date.getTime())
    ? month
    : date.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const account = useCurrentAccount();
  const allowed = useCanOpenInvoices();
  const invoiceQuery = useQuery({
    queryKey: ["finance", "invoice", invoiceId],
    queryFn: () => getInvoiceDetail({ data: { invoiceId } }),
    enabled: allowed,
    retry: false,
  });
  const invoice = invoiceQuery.data ?? null;

  // O menu da fatura (e o aluno dela) só entra com a fatura lida do servidor.
  const focus = useMemo(
    () =>
      invoice
        ? {
            type: "invoice" as const,
            id: invoice.id,
            label: invoice.number,
            schoolId: invoice.schoolId,
            data: invoice,
            ...(invoice.student ? { relations: { student: invoice.student.id } } : {}),
          }
        : null,
    [invoice],
  );
  useDeclareEntityFocus(focus);

  const crumbs = [
    { label: "Início", to: "/portal" },
    { label: "Faturas", to: "/faturas" },
    { label: invoice?.number ?? "Fatura" },
  ];

  let body: ReactNode;
  if (!allowed) {
    body = (
      <EmptyState
        title="Sem acesso às faturas"
        description="As faturas da escola são da Administração e da Tesouraria."
      />
    );
  } else if (invoiceQuery.isLoading) {
    body = <p className="text-sm text-muted-foreground">A abrir a fatura…</p>;
  } else if (invoiceQuery.isError) {
    body = (
      <EmptyState
        title="Não foi possível abrir a fatura"
        description={publicErrorMessage(invoiceQuery.error, "Tente de novo daqui a pouco.")}
      />
    );
  } else if (!invoice) {
    body = (
      <EmptyState
        title="Fatura não encontrada"
        description="Esta fatura não existe nesta escola."
        action={
          <Link to="/faturas" className="text-sm font-semibold text-primary hover:underline">
            Ver as faturas
          </Link>
        }
      />
    );
  } else {
    body = (
      <InvoiceBody
        invoice={invoice}
        // A ficha do aluno segue as regras de `/alunos` (a tesouraria não a abre).
        studentLinks={
          invoice.student &&
          canAccessPath(`/alunos/${invoice.student.id}`, account.role, account.grants)
            ? {
                finance: canReadStudentSection("financeiro", account.role, account.grants),
              }
            : null
        }
      />
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Financeiro"
          title={invoice ? `Fatura ${invoice.number}` : "Fatura"}
          icon={moduleIcons.receipts}
          description="Os dados da fatura, o aluno e os pagamentos e recibos que a liquidam."
          crumbs={crumbs}
        />
        {body}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function InvoiceBody({
  invoice,
  studentLinks,
}: {
  invoice: InvoiceDetail;
  studentLinks: { finance: boolean } | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section
        aria-label="Fatura"
        className="rounded-xl border border-border bg-card p-6 shadow-soft lg:col-span-2"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-base font-bold">{invoice.description}</h2>
          <StatusBadge status={invoice.state.status} label={invoice.state.label} />
        </div>
        {invoice.cancellationReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Motivo da anulação: {invoice.cancellationReason}
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Field label="Mês de referência">{monthLabel(invoice.competenceMonth)}</Field>
          <Field label="Emitida">{invoice.issuedOn ? formatIsoDay(invoice.issuedOn) : "—"}</Field>
          <Field label="Vencimento">{invoice.dueOn ? formatIsoDay(invoice.dueOn) : "—"}</Field>
          <Field label="Valor">{kwanza(invoice.amount)}</Field>
          {invoice.discount > 0 ? (
            <Field label="Desconto">{`− ${kwanza(invoice.discount)}`}</Field>
          ) : null}
          {invoice.penalty > 0 ? (
            <Field label="Multa">{`+ ${kwanza(invoice.penalty)}`}</Field>
          ) : null}
          <Field label="Total">{kwanza(invoice.total)}</Field>
          <Field label="Pago">{kwanza(invoice.paid)}</Field>
          <Field label="Falta pagar">{kwanza(invoice.openAmount)}</Field>
        </dl>
      </section>

      <section
        aria-label="Aluno"
        className="rounded-xl border border-border bg-card p-6 shadow-soft"
      >
        <h2 className="font-display text-base font-bold">Aluno</h2>
        {invoice.student ? (
          <div className="mt-3 space-y-1 text-sm">
            <p className="font-semibold [overflow-wrap:anywhere]">{invoice.student.name}</p>
            <p className="text-xs text-muted-foreground">
              Processo {invoice.student.registrationNumber}
            </p>
            {studentLinks ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs font-semibold">
                {studentLinks.finance ? (
                  <Link
                    to="/alunos/$studentId"
                    params={{ studentId: invoice.student.id }}
                    search={{ secao: "financeiro" }}
                    className="text-primary hover:underline"
                  >
                    Financeiro do aluno
                  </Link>
                ) : null}
                <Link
                  to="/alunos/$studentId"
                  params={{ studentId: invoice.student.id }}
                  className="text-primary hover:underline"
                >
                  Ficha do aluno
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Fatura sem aluno associado.</p>
        )}
      </section>

      <section aria-label="Pagamentos e recibos" className="space-y-3 lg:col-span-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Pagamentos e recibos <span className="font-normal">· {invoice.receipts.length}</span>
        </h2>
        {invoice.receipts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Ainda não há pagamentos registados nesta fatura.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
            {invoice.receipts.map((receipt) => (
              <li
                key={receipt.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold [overflow-wrap:anywhere]">{receipt.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {receipt.paidOn ? formatIsoDay(receipt.paidOn) : "Sem data"}
                    {receipt.method ? ` · ${paymentMethodLabel(receipt.method)}` : ""}
                    {receipt.reversalReason ? ` · ${receipt.reversalReason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={receipt.state.status} label={receipt.state.label} />
                  <span className="text-sm font-semibold">{kwanza(receipt.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Para receber ou anular esta fatura, use a{" "}
          <Link to="/faturas" className="font-semibold text-primary hover:underline">
            lista de faturas
          </Link>
          .
        </p>
      </section>

      {invoice.charges ? (
        <section aria-label="Cobranças electrónicas" className="space-y-3 lg:col-span-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Cobranças electrónicas <span className="font-normal">· {invoice.charges.length}</span>
          </h2>
          {invoice.charges.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhuma cobrança Multicaixa criada para esta fatura.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
              {invoice.charges.map((charge) => (
                <li
                  key={charge.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                      {charge.method}
                      {charge.reference ? ` · ${charge.reference}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {charge.createdAt ? formatIsoDay(charge.createdAt) : "Sem data"}
                      {charge.message ? ` · ${charge.message}` : ""}
                      {charge.receiptNumber ? ` · Recibo ${charge.receiptNumber}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={charge.state.status} label={charge.state.label} />
                    <span className="text-sm font-semibold">{kwanza(charge.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Uma cobrança só conta como paga depois de o fornecedor a confirmar e o recibo ser
            lançado.
          </p>
        </section>
      ) : null}
    </div>
  );
}
