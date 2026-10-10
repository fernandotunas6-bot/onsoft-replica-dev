import { useEffect, useRef, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import type { Context, Gateway } from "../domain/model";
import { parseScoreInput, type TeacherAssessments } from "../domain/assessments";
import { ApiError } from "../services/api";

const termLabel = (term: number) => `${term}.º trimestre`;

/** Lançar notas das avaliações; o servidor confirma professor, cotação, período e pauta. */
export function TeacherScores({
  catalog,
  ctx,
  gateway,
  onAccessError,
}: {
  catalog: AcademicCatalog;
  ctx: Context;
  gateway: Gateway;
  onAccessError?: (error: ApiError) => void;
}) {
  const [data, setData] = useState<TeacherAssessments | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const accessError = useRef(onAccessError);
  accessError.current = onAccessError;
  const report = (e: unknown) => {
    setError(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) accessError.current?.(e);
  };
  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setData(null);
    gateway
      .teacherAssessments?.(ctx, catalog, ac.signal)
      .then((result) => live && setData(result))
      .catch((e) => live && !ac.signal.aborted && report(e));
    return () => {
      live = false;
      ac.abort();
    };
  }, [gateway, ctx, catalog, reload]);
  if (!gateway.teacherAssessments) return null;
  const classes = new Map(catalog.classes.map((c) => [c.classSubjectId, c]));
  const item = data?.items.find((i) => i.id === open) ?? null;
  const group = item ? classes.get(item.classSubjectId) : undefined;
  const stored = new Map((item?.scores ?? []).map((s) => [s.enrollmentId, s]));
  function start(itemId: string) {
    const target = data?.items.find((i) => i.id === itemId);
    setValues(
      Object.fromEntries(
        (target?.scores ?? []).map((s) => [s.enrollmentId, s.score == null ? "" : String(s.score)]),
      ),
    );
    setError("");
    setNotice("");
    setOpen(itemId);
  }
  const parsed = (group?.students ?? []).map((s) => ({
    student: s,
    value: parseScoreInput(values[s.enrollmentId] ?? "", item?.maxScore ?? null),
  }));
  const invalid = parsed.filter((p) => p.value === undefined).length;
  const changed = parsed.filter(
    (p) => p.value !== undefined && p.value !== (stored.get(p.student.enrollmentId)?.score ?? null),
  );
  async function save() {
    if (!data || !item || !gateway.recordScores || !changed.length) return;
    setBusy(true);
    setError("");
    try {
      await gateway.recordScores(
        ctx,
        catalog,
        data,
        item.id,
        changed.map((p) => ({
          enrollmentId: p.student.enrollmentId,
          score: p.value as number | null,
          expectedUpdatedAt: stored.get(p.student.enrollmentId)?.updatedAt ?? null,
        })),
      );
      setOpen(null);
      setNotice(`${changed.length} nota(s) gravada(s).`);
      setReload((r) => r + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          "As notas mudaram entretanto, ou o período/pauta já está fechado. Os dados foram actualizados: revê antes de gravar de novo.",
        );
        setOpen(null);
        setReload((r) => r + 1);
      } else report(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-labelledby="teacher-scores-title">
      <h2 id="teacher-scores-title">Lançar notas</h2>
      {!data && !error && <p role="status">A carregar avaliações…</p>}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data && !item && (
        <>
          {data.items.map((i) => {
            const c = classes.get(i.classSubjectId);
            return (
              <div className="lesson-line" key={i.id}>
                <div>
                  <b>{i.name}</b>
                  <p>
                    {c?.className} · {c?.subjectName} · {termLabel(i.term)}
                    {i.assessedOn && ` · ${i.assessedOn}`}
                  </p>
                </div>
                <button className="pill" onClick={() => start(i.id)}>
                  Lançar
                </button>
              </div>
            );
          })}
          {!data.items.length && (
            <p>Sem avaliações criadas nas tuas disciplinas. Cria-as no portal (Avaliações).</p>
          )}
        </>
      )}
      {item && group && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3>
            {item.name} · {group.className} · {group.subjectName}
          </h3>
          <p className="muted">
            Cotação: {item.maxScore ?? 20} valores. Deixa em branco para não ter nota.
          </p>
          {parsed.map(({ student, value }) => (
            <label className="card" key={student.enrollmentId}>
              {student.name}
              <input
                inputMode="decimal"
                aria-invalid={value === undefined}
                value={values[student.enrollmentId] ?? ""}
                onChange={(e) => setValues({ ...values, [student.enrollmentId]: e.target.value })}
              />
              {value === undefined && (
                <span className="error">Nota inválida (0 a {item.maxScore ?? 20}).</span>
              )}
            </label>
          ))}
          {!group.students.length && <p>Esta turma não tem alunos matriculados.</p>}
          <button
            className="pill primary"
            type="submit"
            disabled={busy || invalid > 0 || !changed.length || changed.length > 80}
          >
            {busy ? "A gravar…" : `Gravar ${changed.length} nota(s)`}
          </button>
          <button type="button" className="pill" disabled={busy} onClick={() => setOpen(null)}>
            Voltar
          </button>
          <p className="small">
            Notas de períodos fechados ou de pautas oficiais só se alteram no portal, por pedido.
          </p>
        </form>
      )}
    </section>
  );
}
