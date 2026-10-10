import { useEffect, useRef, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import type { AcademicGradebooks } from "../domain/gradebooks";
import type { Context, Gateway } from "../domain/model";
import { ApiError } from "../services/api";
const bookLabels = { draft: "Rascunho", open: "Aberto", submitted: "Submetido", closed: "Fechado" };
const scoreLabels = { draft: "Rascunho", submitted: "Submetida", locked: "Bloqueada" };
const format = (n: number) =>
  new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 2 }).format(n);
export function InstitutionalGradebooks({
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
    data: AcademicGradebooks;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
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
      gateway.academicGradebooks?.(ctx, catalog, ac.signal) ??
      Promise.reject(new Error("A consulta de diários não está disponível nesta ligação."));
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
  const books =
    data?.books.filter(
      (b) => (!classId || b.classSubjectId === classId) && (!termId || b.term.id === termId),
    ) ?? [];
  const terms = [...new Map((data?.books ?? []).map((b) => [b.term.id, b.term])).values()];
  return (
    <section>
      <p className="small">
        Diários das disciplinas atribuídas · Consulta interna do professor. Fechado ou bloqueado não
        significa publicado ao aluno.
      </p>
      <button className="pill" disabled={loading} onClick={() => setReload((n) => n + 1)}>
        Actualizar diários
      </button>
      <label>
        Disciplina
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Todas as disciplinas</option>
          {catalog.classes.map((c) => (
            <option key={c.classSubjectId} value={c.classSubjectId}>
              {c.className} · {c.subjectName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Período
        <select value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">Todos os períodos</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Pesquisar aluno
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {loading && <p role="status">A carregar diários…</p>}
      {error && <p role="alert">{error}</p>}
      {data && !books.length && <p role="status">Sem diários para os filtros seleccionados.</p>}
      {books.map((b) => {
        const c = catalog.classes.find((c) => c.classSubjectId === b.classSubjectId)!;
        const students = c.students.filter((s) =>
          s.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
        );
        return (
          <article className="card" key={b.id}>
            <h2>
              {c.subjectName} · {b.term.name}
            </h2>
            <p>
              {c.className} · Diário {bookLabels[b.status].toLocaleLowerCase()}
            </p>
            {!b.items.length && <p>Sem componentes de avaliação neste diário.</p>}
            {b.items.map((item) => (
              <details key={item.id}>
                <summary>
                  {item.code} · {item.name} · Máximo {format(item.maxScore)}
                </summary>
                <p>
                  {item.assessedOn
                    ? `Avaliada em ${item.assessedOn}.`
                    : "Sem data de avaliação indicada."}
                </p>
                {!students.length && <p>Sem alunos para a pesquisa.</p>}
                <ul>
                  {students.map((student) => {
                    const score = item.scores.find((s) => s.enrollmentId === student.enrollmentId);
                    return (
                      <li key={student.enrollmentId}>
                        <strong>{student.name}</strong>:{" "}
                        {score
                          ? `${format(score.value)} / ${format(item.maxScore)} · ${scoreLabels[score.status]}`
                          : "Sem nota registada"}
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </article>
        );
      })}
    </section>
  );
}
