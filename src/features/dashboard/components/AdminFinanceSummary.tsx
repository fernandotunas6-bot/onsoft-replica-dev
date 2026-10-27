import { kwanza } from "@/lib/currency";

type FinanceSummary = {
  billed: number;
  received: number;
  outstanding: number;
  overdue: number;
};

const metrics = [
  { key: "received", label: "Recebido" },
  { key: "billed", label: "Facturado" },
  { key: "outstanding", label: "Por receber" },
  { key: "overdue", label: "Em atraso" },
] as const;

/** Indicadores financeiros do overview autenticado, sem estimativas inventadas. */
export function AdminFinanceSummary({
  finance,
  loading,
}: {
  finance: FinanceSummary | null | undefined;
  loading: boolean;
}) {
  return (
    <section aria-labelledby="home-finance-summary" className="surface-card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="home-finance-summary" className="text-base font-semibold">
          Resumo financeiro
        </h2>
        <span className="text-xs text-muted-foreground">Valores registados no sistema</span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-border/70 p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 break-words text-xl font-semibold tabular-nums text-foreground">
              {loading ? "…" : finance ? kwanza(finance[key]) : "—"}
            </dd>
          </div>
        ))}
      </dl>
      {!loading && !finance ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Ainda não estão disponíveis indicadores financeiros para esta escola.
        </p>
      ) : null}
    </section>
  );
}
