import { useEffect, useRef, useState } from "react";
import type { DocumentStatus, StudentDocuments } from "../domain/documents";
import type { Context, Gateway } from "../domain/model";
import { ApiError } from "../services/api";

/**
 * Para o aluno, um passo por estado da base. O portal junta «approved» e
 * «fulfilled» em «Emitido» (é a vista da secretaria); aqui o aluno precisa de
 * saber se já pode levantar (approved) ou se já levantou (fulfilled).
 */
const statusLabels: Record<DocumentStatus, string> = {
  submitted: "Recebido",
  in_review: "Em análise",
  approved: "Pronto a levantar",
  fulfilled: "Entregue",
  rejected: "Recusado",
  cancelled: "Cancelado",
};
const open: DocumentStatus[] = ["submitted", "in_review", "approved"];
const day = (iso: string) =>
  new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium", timeZone: "Africa/Luanda" }).format(
    new Date(iso),
  );

/** Pedidos de documentos do próprio aluno, só para consulta. */
export function InstitutionalDocuments({
  ctx,
  gateway,
  onAccessError,
}: {
  ctx: Context;
  gateway: Gateway;
  onAccessError?: (error: ApiError) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; data: StudentDocuments } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
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
      gateway.studentDocuments?.(ctx, ac.signal) ??
      Promise.reject(new Error("A consulta de documentos não está disponível nesta ligação."));
    request
      .then((data) => {
        if (live) setLoaded({ key, data });
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
  }, [ctx, gateway, key, reload]);
  const data = loaded?.key === key ? loaded.data : null;
  const ongoing = data?.requests.filter((r) => open.includes(r.status)) ?? [];
  const closed = data?.requests.filter((r) => !open.includes(r.status)) ?? [];
  return (
    <section>
      <p className="small">
        Os seus pedidos de documentos · Os pedidos são registados pela secretaria da escola.
      </p>
      <button className="pill" disabled={loading} onClick={() => setReload((n) => n + 1)}>
        Actualizar documentos
      </button>
      {loading && <p role="status">A carregar documentos…</p>}
      {error && <p role="alert">{error}</p>}
      {data && !data.requests.length && (
        <p role="status">Ainda não tem pedidos de documentos nesta escola.</p>
      )}
      {(
        [
          ["Em curso", ongoing],
          ["Concluídos", closed],
        ] as const
      ).map(
        ([title, list]) =>
          list.length > 0 && (
            <section className="agendaday" key={title} aria-label={title}>
              <h3>
                {title} · {list.length}
              </h3>
              {list.map((r) => (
                <article className="card" key={r.id}>
                  <h2>
                    {r.document}
                    <span className="status-chip">{statusLabels[r.status]}</span>
                  </h2>
                  {r.details && <p>{r.details}</p>}
                  <p className="small">
                    Pedido em {day(r.requestedAt)}
                    {r.updatedAt !== r.requestedAt && ` · Actualizado em ${day(r.updatedAt)}`}.
                  </p>
                  {r.status === "approved" && (
                    <p>O documento está pronto. Levante-o na secretaria.</p>
                  )}
                </article>
              ))}
            </section>
          ),
      )}
      {data && (
        <article className="card">
          <h2>Pedir um documento</h2>
          <p>
            Dirija-se à secretaria da escola. O pedido aparece aqui assim que for registado, e o
            estado actualiza-se sozinho.
          </p>
          {data.available.length ? (
            <>
              <p className="small">Documentos que a escola emite:</p>
              <ul>
                {data.available.map((t) => (
                  <li key={t.name}>{t.name}</li>
                ))}
              </ul>
            </>
          ) : null}
        </article>
      )}
    </section>
  );
}
