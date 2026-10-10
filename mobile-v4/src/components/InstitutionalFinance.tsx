import { getPayflowPayerUrl } from "../../../src/lib/ecosystem-urls";
import { useEffect, useRef, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import { invoiceAmounts, type StudentFinance } from "../domain/finance";
import type { Context, Gateway } from "../domain/model";
import { ApiError } from "../services/api";
const statusLabels = {
  open: "Em aberto",
  partially_paid: "Parcialmente paga",
  paid: "Paga",
  cancelled: "Anulada",
};
const methods = {
  cash: "Numerário",
  bank_transfer: "Transferência bancária",
  card: "Cartão",
  other: "Outro",
};
const money = (cents: number) =>
  new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" }).format(cents / 100);
export function InstitutionalFinance({
  ctx,
  catalog,
  gateway,
  onAccessError,
  paidOnly = false,
}: {
  ctx: Context;
  catalog: AcademicCatalog;
  gateway: Gateway;
  onAccessError?: (error: ApiError) => void;
  paidOnly?: boolean;
}) {
  const [loaded, setLoaded] = useState<{
    key: string;
    catalog: AcademicCatalog;
    data: StudentFinance;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState("");
  const accessError = useRef(onAccessError);
  accessError.current = onAccessError;
  const key = `${ctx.userId}:${ctx.schoolId}:${ctx.role}`;
  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setLoaded(null);
    setError("");
    setLoading(true);
    const request =
      gateway.studentFinance?.(ctx, ac.signal) ??
      Promise.reject(new Error("A consulta de propinas não está disponível nesta ligação."));
    request
      .then((data) => {
        if (live) setLoaded({ key, catalog, data });
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          if (e instanceof ApiError && [401, 403].includes(e.status)) accessError.current?.(e);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [ctx, catalog, gateway, key, reload]);
  const data = loaded?.key === key && loaded.catalog === catalog ? loaded.data : null;
  const rows =
    data?.invoices.filter(
      (i) => (!paidOnly || i.status === "paid") && (!filter || i.status === filter),
    ) ?? [];
  const payer = getPayflowPayerUrl();
  return (
    <section>
      <p className="small">
        Cobranças e recibos próprios do SIGA Plus · Inclui matrículas anteriores.
      </p>
      <button className="pill" disabled={loading} onClick={() => setReload((n) => n + 1)}>
        Actualizar propinas
      </button>
      {data && payer && !paidOnly && (
        <>
          <a className="pill" href={payer} target="_blank" rel="noopener noreferrer">
            Pagar no PayFlow
          </a>
          <p className="small">
            Usa as credenciais de pagamento emitidas pela escola. Abrir o portal não confirma um
            pagamento.
          </p>
        </>
      )}
      {!paidOnly && (
        <label>
          Estado da cobrança
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas as cobranças</option>
            {Object.entries(statusLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {loading && <p role="status">A carregar propinas…</p>}
      {error && <p role="alert">{error}</p>}
      {data && !rows.length && <p role="status">Sem cobranças para os filtros seleccionados.</p>}
      {rows.map((i) => {
        const amounts = invoiceAmounts(i);
        return (
          <article className="card" key={i.id}>
            <h2>{i.label}</h2>
            <p>
              Fatura {i.number} · {statusLabels[i.status]}
            </p>
            <p>
              {i.competence ? `Referente a ${i.competence.slice(0, 7)} · ` : ""}Vencimento: {i.due}
            </p>
            <dl>
              <dt>Total com desconto e penalização</dt>
              <dd>{money(amounts.total)}</dd>
              <dt>Pagamentos confirmados por recibos</dt>
              <dd>{money(amounts.paid)}</dd>
              <dt>Saldo pelos recibos</dt>
              <dd>{money(amounts.remaining)}</dd>
            </dl>
            <details>
              <summary>Recibos ({i.receipts.length})</summary>
              {!i.receipts.length && <p>Sem recibos registados.</p>}
              <ul>
                {i.receipts.map((r) => (
                  <li key={r.id}>
                    {r.number} · {r.paidOn} · {money(r.amountCents)} · {methods[r.method]} ·{" "}
                    {r.status === "issued" ? "Emitido" : "Estornado"}
                  </li>
                ))}
              </ul>
            </details>
          </article>
        );
      })}
    </section>
  );
}
