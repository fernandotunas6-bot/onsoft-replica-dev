import { useEffect, useMemo, useRef, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import type { AcademicAttendance, StudentAttendanceStatus } from "../domain/attendance";
import type { Context, Gateway } from "../domain/model";
import { ApiError } from "../services/api";
import { daysOfMonth, luandaDate, type DayStatus } from "../domain/calendar";
import { attendanceLabels } from "./AttendanceMap";
import { Icon } from "./Icon";
import { AttendanceCall } from "./AttendanceCall";
const studentLabels: Record<StudentAttendanceStatus, string> = {
  present: "Presente",
  absent: "Falta",
  excused: "Falta justificada",
  late: "Atraso",
  early_exit: "Saída antecipada",
  not_registered: "Sem registo",
};
const teacherLabels = {
  scheduled: "Prevista",
  confirmed: "Confirmada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
};
function studentDay(rows: AcademicAttendance["sessions"]): DayStatus {
  rows = rows.filter((s) => s.status !== "cancelled");
  const marks = rows.flatMap((s) =>
    s.status === "completed" ? s.records.map((r) => r.status) : [],
  );
  if (!rows.length) return "sem-aulas";
  if (!marks.length || marks.every((s) => s === "not_registered")) return "pendente";
  if (rows.some((s) => s.status === "pending") || marks.includes("not_registered")) return "misto";
  if (marks.every((s) => s === "present" || s === "late")) return "presente";
  if (marks.every((s) => s === "absent")) return "ausente";
  if (marks.every((s) => s === "excused")) return "justificada";
  return "misto";
}
function teacherDay(rows: AcademicAttendance["teacherLessons"]): DayStatus {
  if (!rows.length) return "sem-aulas";
  if (rows.every((l) => l.status === "confirmed")) return "presente";
  if (rows.every((l) => l.status === "cancelled")) return "sem-aulas";
  if (rows.every((l) => l.status !== "confirmed")) return "pendente";
  return "misto";
}
export function InstitutionalAttendance({
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
  const [month, setMonth] = useState(luandaDate().slice(0, 7));
  const [selected, setSelected] = useState(luandaDate());
  const [loaded, setLoaded] = useState<{ month: string; data: AcademicAttendance } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [saved, setSaved] = useState("");
  const dates = useMemo(() => daysOfMonth(month), [month]);
  const range = useMemo(() => ({ from: dates[0], to: dates.at(-1)! }), [dates]);
  const accessError = useRef(onAccessError);
  accessError.current = onAccessError;
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setLoaded(null);
    setError("");
    setLoading(true);
    const request =
      gateway.academicAttendance?.(ctx, range, catalog, ac.signal) ??
      Promise.reject(new Error("A consulta de presenças não está disponível nesta ligação."));
    request
      .then((data) => {
        if (live) setLoaded({ month, data });
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          if (e instanceof ApiError && (e.status === 401 || e.status === 403))
            accessError.current?.(e);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [gateway, ctx, catalog, range, month, reload]);
  const data = loaded?.month === month ? loaded.data : null;
  const classes = new Map(catalog.classes.map((c) => [c.classSubjectId, c]));
  const sessions = data?.sessions.filter((s) => s.date === selected) ?? [];
  const lessons = data?.teacherLessons.filter((s) => s.date === selected) ?? [];
  const gap = (new Date(month + "-01T12:00:00Z").getUTCDay() + 6) % 7;
  const statusFor = (date: string) =>
    !data
      ? "pendente"
      : ctx.role === "professor"
        ? teacherDay(data.teacherLessons.filter((s) => s.date === date))
        : studentDay(data.sessions.filter((s) => s.date === date));
  const dayLabel = (date: string) => {
    const status = statusFor(date);
    if (ctx.role !== "professor") return attendanceLabels[status];
    return status === "presente"
      ? "Ocorrências confirmadas"
      : status === "sem-aulas"
        ? "Sem ocorrências docentes"
        : status === "misto"
          ? "Ocorrências mistas"
          : "Sem confirmação";
  };
  useEffect(() => setSaved(""), [selected, ctx]);
  function changeMonth(offset: number) {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
    setMonth(next);
    setSelected(next + "-01");
  }
  return (
    <section className="attendance-map">
      <div className="map-heading">
        <button className="iconbtn" aria-label="Mês anterior" onClick={() => changeMonth(-1)}>
          <Icon name="chevron-left" />
        </button>
        <h2>
          {new Intl.DateTimeFormat("pt-AO", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(month + "-01T12:00:00Z"))}
        </h2>
        <button className="iconbtn" aria-label="Mês seguinte" onClick={() => changeMonth(1)}>
          <Icon name="chevron-right" />
        </button>
      </div>
      <p className="small">
        {ctx.role === "professor"
          ? "As tuas ocorrências docentes · chamadas dos alunos separadas abaixo."
          : "As tuas presenças registadas no SIGA Plus."}
      </p>
      <button className="pill" disabled={loading} onClick={() => setReload((r) => r + 1)}>
        Actualizar presenças
      </button>
      {loading && <p role="status">A carregar presenças…</p>}
      {saved && <p role="status">{saved}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div ref={scroll} className="map-scroll">
        <div className="month-grid">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
            <span key={d} className="week-label">
              {d}
            </span>
          ))}
          {Array.from({ length: gap }, (_, i) => (
            <span key={"gap" + i} />
          ))}
          {dates.map((date) => (
            <button
              key={date}
              data-date={date}
              disabled={!data}
              tabIndex={date === selected ? 0 : -1}
              className={"day-cell " + statusFor(date) + (date === selected ? " selected-day" : "")}
              aria-label={`${date}: ${data ? dayLabel(date) : "Aguardando consulta"}`}
              aria-pressed={date === selected}
              onClick={() => setSelected(date)}
              onKeyDown={(e) => {
                const offset: Record<string, number> = {
                  ArrowUp: -7,
                  ArrowDown: 7,
                  ArrowLeft: -1,
                  ArrowRight: 1,
                };
                if (offset[e.key]) {
                  e.preventDefault();
                  const next = dates[dates.indexOf(date) + offset[e.key]];
                  if (next) {
                    setSelected(next);
                    scroll.current
                      ?.querySelector<HTMLElement>('[data-date="' + next + '"]')
                      ?.focus();
                  }
                }
              }}
            >
              <span>{Number(date.slice(-2))}</span>
              <span className="day-dot" />
            </button>
          ))}
        </div>
      </div>
      <div className="map-legend">
        {(
          (ctx.role === "professor"
            ? ["presente", "misto", "pendente"]
            : ["presente", "ausente", "justificada", "misto", "pendente"]) as DayStatus[]
        ).map((s) => (
          <span key={s} className={s}>
            <i className="day-dot" />
            {ctx.role === "professor" && s === "presente"
              ? "Ocorrência confirmada"
              : attendanceLabels[s]}
          </span>
        ))}
      </div>
      {data && (
        <div className="card" aria-live="polite">
          <h3>{selected}</h3>
          {ctx.role === "professor" && (
            <>
              <h3>Ocorrências docentes</h3>
              {lessons.map((l) => (
                <div className="lesson-line" key={l.id}>
                  <div>
                    <b>{classes.get(l.classSubjectId)?.subjectName}</b>
                    <p>
                      {l.startsAt}–{l.endsAt}
                    </p>
                  </div>
                  <span
                    className={
                      "status-chip " + (l.status === "confirmed" ? "presente" : "pendente")
                    }
                  >
                    {teacherLabels[l.status]}
                  </span>
                </div>
              ))}
              {!lessons.length && <p>Sem ocorrências docentes registadas neste dia.</p>}
              <h3>Chamadas dos alunos</h3>
              <AttendanceCall
                key={selected}
                ctx={ctx}
                gateway={gateway}
                catalog={catalog}
                attendance={data}
                date={selected}
                today={luandaDate()}
                onSaved={(message) => {
                  setSaved(message);
                  setReload((r) => r + 1);
                }}
              />
            </>
          )}
          {sessions.map((s) => (
            <article key={s.id} className="card">
              <h3>
                {classes.get(s.classSubjectId)?.className} ·{" "}
                {classes.get(s.classSubjectId)?.subjectName}
              </h3>
              <p>
                {s.startsAt ?? "Hora não indicada"}
                {s.endsAt && `–${s.endsAt}`} ·{" "}
                {s.status === "completed"
                  ? "Chamada concluída"
                  : s.status === "cancelled"
                    ? "Chamada cancelada"
                    : "Chamada pendente"}
              </p>
              {s.records.map((r) => (
                <p key={r.studentId}>
                  {ctx.role === "professor"
                    ? classes
                        .get(s.classSubjectId)
                        ?.students.find((p) => p.studentId === r.studentId)?.name + ": "
                    : ""}
                  {studentLabels[r.status]}
                </p>
              ))}
              {!s.records.length && <p>Sem registos de presença disponíveis.</p>}
            </article>
          ))}
          {!sessions.length && <p>Sem chamadas registadas neste dia.</p>}
        </div>
      )}
      <p className="small">
        Sem registo não significa falta. Só as chamadas concluídas mostram marcações; ocorrências
        docentes rejeitadas ou previstas não são faltas.
      </p>
    </section>
  );
}
