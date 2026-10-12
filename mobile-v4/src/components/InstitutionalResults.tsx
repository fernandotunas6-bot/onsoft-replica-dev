import { useEffect, useRef, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import type { AcademicResults } from "../domain/results";
import type { Context, Gateway } from "../domain/model";
import { ApiError } from "../services/api";
const resultLabels = {
  pending: "Pendente",
  pass: "Aprovado",
  fail: "Não aprovado",
  incomplete: "Incompleto",
};
const format = (n: number | null) =>
  n === null
    ? "Sem média publicada"
    : new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 6 }).format(n);
export function InstitutionalResults({
  ctx,
  catalog,
  gateway,
  onAccessError,
}: {
  ctx: Context;
  catalog: AcademicCatalog;
  gateway: Gateway;
  onAccessError?: (error: ApiError) => void;
}) {
  const [loaded, setLoaded] = useState<{
    key: string;
    catalog: AcademicCatalog;
    data: AcademicResults;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [kind, setKind] = useState("");
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
      gateway.academicResults?.(ctx, catalog, ac.signal) ??
      Promise.reject(new Error("A consulta de pautas não está disponível nesta ligação."));
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
  const rows = data?.sheets.filter((s) => !kind || s.kind === kind) ?? [];
  return (
    <section>
      <p className="small">
        Pautas publicadas do SIGA Plus · Matrículas activas · Médias institucionais da pauta.
      </p>
      <button className="pill" disabled={loading} onClick={() => setReload((n) => n + 1)}>
        Actualizar pautas
      </button>
      <label>
        Tipo de pauta
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todas as pautas</option>
          <option value="term">Período</option>
          <option value="annual">Anual</option>
        </select>
      </label>
      {loading && <p role="status">A carregar pautas…</p>}
      {error && <p role="alert">{error}</p>}
      {data && !rows.length && (
        <p role="status">Sem pautas publicadas para os filtros seleccionados.</p>
      )}
      {rows.map((s) => (
        <article className="card" key={`${s.id}:${s.enrollmentId}`}>
          <h2>{s.title}</h2>
          <p>
            {catalog.classes.find((c) => c.classGroupId === s.classGroupId)?.className} ·{" "}
            {s.kind === "annual" ? "Pauta anual" : "Pauta de período"}
          </p>
          <p>
            Publicada em{" "}
            {new Date(s.publishedAt).toLocaleDateString("pt-AO", { timeZone: "Africa/Luanda" })}
          </p>
          <dl>
            <dt>Média contínua</dt>
            <dd>{format(s.continuousAverage)}</dd>
            <dt>Média de exame</dt>
            <dd>{format(s.examAverage)}</dd>
            <dt>Média da pauta</dt>
            <dd>{format(s.termAverage)}</dd>
            <dt>Resultado</dt>
            <dd>{resultLabels[s.result]}</dd>
          </dl>
        </article>
      ))}
    </section>
  );
}
