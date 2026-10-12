import { useEffect, useRef, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import type { AcademicLessonPlans } from "../domain/lesson-plans";
import type { Context, Gateway } from "../domain/model";
import { ApiError } from "../services/api";

const statusLabels = { draft: "Rascunho", published: "Publicado" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Planos de aula das disciplinas do professor, só para consulta. */
export function InstitutionalLessonPlans({
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
    data: AcademicLessonPlans;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [classId, setClassId] = useState("");
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
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
      gateway.academicLessonPlans?.(ctx, catalog, ac.signal) ??
      Promise.reject(new Error("A consulta de planos de aula não está disponível nesta ligação."));
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
  const query = search.trim().toLocaleLowerCase();
  const plans =
    data?.plans.filter(
      (p) =>
        (!classId || p.classSubjectId === classId) &&
        (!term || p.term === Number(term)) &&
        (!query || `${p.title} ${p.content ?? ""}`.toLocaleLowerCase().includes(query)),
    ) ?? [];
  const mine = catalog.classes.filter((c) => c.teacher?.userId === ctx.userId);
  return (
    <section>
      <p className="small">
        Planos de aula das disciplinas que lecciona · Só consulta. Criar e alterar faz-se no portal,
        porque o plano gera as avaliações da pauta.
      </p>
      <button className="pill" disabled={loading} onClick={() => setReload((n) => n + 1)}>
        Actualizar planos
      </button>
      <label>
        Disciplina
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Todas as disciplinas</option>
          {mine.map((c) => (
            <option key={c.classSubjectId} value={c.classSubjectId}>
              {c.className} · {c.subjectName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Trimestre
        <select value={term} onChange={(e) => setTerm(e.target.value)}>
          <option value="">Todos os trimestres</option>
          {[1, 2, 3].map((t) => (
            <option key={t} value={t}>
              {t}.º trimestre
            </option>
          ))}
        </select>
      </label>
      <label>
        Pesquisar no plano
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {loading && <p role="status">A carregar planos de aula…</p>}
      {error && <p role="alert">{error}</p>}
      {data && !data.plans.length && (
        <p role="status">Ainda não há planos de aula para as suas disciplinas.</p>
      )}
      {data && !!data.plans.length && !plans.length && (
        <p role="status">Sem planos para os filtros seleccionados.</p>
      )}
      {plans.map((p) => {
        const c = catalog.classes.find((c) => c.classSubjectId === p.classSubjectId)!;
        const assessments = p.components.filter((x) => x.kind === "avaliacao");
        const tests = p.components.filter((x) => x.kind === "prova");
        const count = (list: typeof p.components) =>
          list.reduce((total, x) => total + x.plannedCount, 0);
        return (
          <article className="card" key={p.id}>
            <h2>
              {p.title}
              <span className="status-chip">{statusLabels[p.status]}</span>
            </h2>
            <p>
              {c.className} · {c.subjectName} · {p.term}.º trimestre
            </p>
            {p.components.length ? (
              <p>
                Prevê {plural(count(assessments), "avaliação", "avaliações")} e{" "}
                {plural(count(tests), "prova", "provas")}:{" "}
                {p.components.map((x) => x.name).join(", ")}.
              </p>
            ) : (
              <p>Sem avaliações previstas neste plano.</p>
            )}
            {p.content ? (
              <details>
                <summary>Ler o plano</summary>
                <p className="plan-content">{p.content}</p>
              </details>
            ) : (
              <p className="small">Plano sem texto.</p>
            )}
            {p.fileName && <p className="small">Anexo no portal: {p.fileName}</p>}
            <p className="small">
              Actualizado em{" "}
              {new Intl.DateTimeFormat("pt-AO", {
                dateStyle: "medium",
                timeZone: "Africa/Luanda",
              }).format(new Date(p.updatedAt))}
              .
            </p>
          </article>
        );
      })}
    </section>
  );
}
