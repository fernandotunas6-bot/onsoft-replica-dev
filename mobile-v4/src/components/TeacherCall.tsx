import { useEffect, useRef, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import type { AttendanceStatus, Context, Gateway } from "../domain/model";
import { initialMark, type TeacherDay } from "../domain/teacher-day";
import { ApiError } from "../services/api";

const choices: { value: AttendanceStatus; label: string }[] = [
  { value: "presente", label: "Presente" },
  { value: "ausente", label: "Falta" },
  { value: "justificada", label: "Justificada" },
];

/** Chamada das aulas de hoje: o servidor confirma o professor, a turma e a pauta. */
export function TeacherCall({
  catalog,
  ctx,
  gateway,
  onSaved,
  onAccessError,
}: {
  catalog: AcademicCatalog;
  ctx: Context;
  gateway: Gateway;
  onSaved?: () => void;
  onAccessError?: (error: ApiError) => void;
}) {
  const [day, setDay] = useState<TeacherDay | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
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
    setDay(null);
    setError("");
    gateway
      .teacherDay?.(ctx, catalog, ac.signal)
      .then((data) => live && setDay(data))
      .catch((e) => live && !ac.signal.aborted && report(e));
    return () => {
      live = false;
      ac.abort();
    };
  }, [gateway, ctx, catalog, reload]);
  const classes = new Map(catalog.classes.map((c) => [c.classSubjectId, c]));
  const lesson = day?.lessons.find((l) => l.sessionId === open) ?? null;
  const group = lesson ? classes.get(lesson.classSubjectId) : undefined;
  function start(sessionId: string) {
    const target = day?.lessons.find((l) => l.sessionId === sessionId);
    const preset: Record<string, AttendanceStatus> = {};
    for (const record of target?.records ?? []) {
      const mark = initialMark(record.status);
      if (mark) preset[record.studentId] = mark;
    }
    setMarks(preset);
    setNotice("");
    setError("");
    setOpen(sessionId);
  }
  const missing = group ? group.students.filter((s) => !marks[s.studentId]).length : 0;
  async function save() {
    if (!day || !lesson || !group || !gateway.recordAttendance) return;
    setBusy(true);
    setError("");
    try {
      await gateway.recordAttendance(
        ctx,
        catalog,
        day,
        lesson.sessionId,
        group.students.map((s) => ({ studentId: s.studentId, status: marks[s.studentId] })),
      );
      setOpen(null);
      setNotice("Chamada gravada e fechada.");
      setReload((r) => r + 1);
      onSaved?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          "Esta chamada já foi fechada com outros registos ou a pauta do período já é oficial. Corrige-a no portal, com o motivo.",
        );
        setReload((r) => r + 1);
      } else report(e);
    } finally {
      setBusy(false);
    }
  }
  if (!gateway.teacherDay) return null;
  return (
    <section className="card" aria-labelledby="teacher-call-title">
      <h2 id="teacher-call-title">Chamada de hoje</h2>
      {!day && !error && <p role="status">A preparar as aulas de hoje…</p>}
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
      {day && !lesson && (
        <>
          {day.lessons.map((l) => {
            const c = classes.get(l.classSubjectId);
            return (
              <div className="lesson-line" key={l.sessionId}>
                <div>
                  <b>
                    {c?.className} · {c?.subjectName}
                  </b>
                  <p>
                    {l.startsAt ?? "Hora não indicada"}
                    {l.endsAt && `–${l.endsAt}`}
                    {l.room && ` · ${l.room}`}
                  </p>
                </div>
                {l.status === "pending" ? (
                  <button className="pill" onClick={() => start(l.sessionId)}>
                    Fazer chamada
                  </button>
                ) : (
                  <span className="status-chip presente">
                    {l.status === "completed" ? "Concluída" : "Cancelada"}
                  </span>
                )}
              </div>
            );
          })}
          {!day.lessons.length && <p>Sem aulas no teu horário de hoje.</p>}
        </>
      )}
      {lesson && group && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3>
            {group.className} · {group.subjectName}
          </h3>
          <button
            type="button"
            className="pill"
            onClick={() =>
              setMarks(Object.fromEntries(group.students.map((s) => [s.studentId, "presente"])))
            }
          >
            Todos presentes
          </button>
          {group.students.map((s) => (
            <fieldset className="card" key={s.studentId}>
              <legend>{s.name}</legend>
              {choices.map((choice) => (
                <label key={choice.value} className="checkline">
                  <input
                    type="radio"
                    name={"mark-" + s.studentId}
                    checked={marks[s.studentId] === choice.value}
                    onChange={() => setMarks({ ...marks, [s.studentId]: choice.value })}
                  />
                  {choice.label}
                </label>
              ))}
            </fieldset>
          ))}
          {!group.students.length && <p>Esta turma não tem alunos matriculados.</p>}
          {missing > 0 && <p className="muted">Falta marcar {missing} aluno(s).</p>}
          <button
            className="pill primary"
            type="submit"
            disabled={busy || missing > 0 || !group.students.length}
          >
            {busy ? "A gravar…" : "Fechar chamada"}
          </button>
          <button type="button" className="pill" disabled={busy} onClick={() => setOpen(null)}>
            Voltar
          </button>
          <p className="small">Depois de fechada, a chamada só se corrige no portal, com motivo.</p>
        </form>
      )}
    </section>
  );
}
