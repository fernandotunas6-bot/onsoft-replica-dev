import { useState, useRef, useEffect } from "react";
import type { Workspace, Context } from "../domain/model";
import {
  summaryForDay,
  daysOfMonth,
  yearDays,
  calendarStats,
  luandaDate,
  type DayStatus,
} from "../domain/calendar";
import { Icon } from "./Icon";
export const attendanceLabels: Record<DayStatus, string> = {
  presente: "Presença",
  ausente: "Falta",
  justificada: "Falta justificada",
  misto: "Registos mistos",
  pendente: "Por registar",
  "sem-aulas": "Sem aulas",
};
export function AttendanceMap({
  data,
  ctx,
  annual = false,
}: {
  data: Workspace;
  ctx: Context;
  annual?: boolean;
}) {
  const [month, setMonth] = useState(luandaDate().slice(0, 7));
  const scroll = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(luandaDate());
  const dates = annual ? yearDays(Number(month.slice(0, 4))) : daysOfMonth(month);
  const stats = calendarStats(data, ctx, dates);
  const summary = summaryForDay(data, ctx, selected);
  function changeMonth(offset: number) {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
    setMonth(next);
    setSelected(next + "-01");
  }
  const firstGap = (new Date(month + "-01T12:00:00Z").getUTCDay() + 6) % 7;
  useEffect(() => {
    if (annual && scroll.current) {
      const active = scroll.current.querySelector<HTMLElement>(".selected-day");
      if (active) scroll.current.scrollLeft = active.offsetLeft - scroll.current.clientWidth / 2;
    }
  }, [annual]);
  return (
    <section className="attendance-map">
      <div className="map-heading">
        <h2>{annual ? "Mapa de aulas no ano" : "Mapa de aulas"}</h2>
        {!annual && (
          <div className="actions">
            <button className="round" aria-label="Mês anterior" onClick={() => changeMonth(-1)}>
              <Icon name="chevron-left" />
            </button>
            <button className="round" aria-label="Mês seguinte" onClick={() => changeMonth(1)}>
              <Icon name="chevron-right" />
            </button>
          </div>
        )}
      </div>
      <p className="muted">
        {ctx.role === "professor" ? "A tua presença como professor" : "A tua presença nas aulas"} ·{" "}
        {annual
          ? month.slice(0, 4)
          : new Intl.DateTimeFormat("pt-AO", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(month + "-01T12:00:00Z"))}
      </p>
      <div ref={scroll} className={"map-scroll " + (annual ? "annual" : "")}>
        {annual && (
          <div className="year-labels">
            {dates
              .filter((d) => d.endsWith("-01"))
              .map((date) => (
                <span key={date} style={{ gridColumn: Math.floor(dates.indexOf(date) / 7) + 1 }}>
                  {new Intl.DateTimeFormat("pt-AO", { month: "short", timeZone: "UTC" }).format(
                    new Date(date + "T12:00:00Z"),
                  )}
                </span>
              ))}
          </div>
        )}
        <div className={annual ? "year-grid" : "month-grid"}>
          {!annual &&
            ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <span key={d} className="week-label">
                {d}
              </span>
            ))}
          {!annual && Array.from({ length: firstGap }, (_, i) => <span key={"gap" + i} />)}
          {dates.map((date) => {
            const d = summaryForDay(data, ctx, date);
            return (
              <button
                key={date}
                data-date={date}
                tabIndex={date === selected ? 0 : -1}
                onKeyDown={(e) => {
                  const offset: Record<string, number> = annual
                    ? { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }
                    : { ArrowUp: -7, ArrowDown: 7, ArrowLeft: -1, ArrowRight: 1 };
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
                className={"day-cell " + d.status + (date === selected ? " selected-day" : "")}
                aria-label={`${date}: ${attendanceLabels[d.status]}, ${d.lessons.length} aulas`}
                aria-pressed={date === selected}
                onClick={() => setSelected(date)}
              >
                {!annual && <span>{Number(date.slice(-2))}</span>}
                <span className="day-dot" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="map-legend">
        {(["presente", "ausente", "justificada", "misto", "pendente"] as DayStatus[]).map((s) => (
          <span key={s} className={s}>
            <i className="day-dot" />
            {attendanceLabels[s]}
          </span>
        ))}
      </div>
      <div className="map-stats">
        <div>
          <span>Presenças</span>
          <b>{stats.present} aulas</b>
        </div>
        <div>
          <span>Faltas</span>
          <b>{stats.absent}</b>
        </div>
        <div>
          <span>Dias com presença</span>
          <b>{stats.activeDays}</b>
        </div>
        <div>
          <span>Aulas previstas</span>
          <b>{stats.total}</b>
        </div>
      </div>
      <div className="card" aria-live="polite">
        <h3>{selected}</h3>
        {summary.lessons.length ? (
          summary.lessons.map((l, i) => (
            <div className="lesson-line" key={l.id}>
              <div>
                <b>{data.classes.find((g) => g.id === l.classId)?.subject}</b>
                <p>
                  {l.time} · {l.room}
                </p>
                <p>{l.topic}</p>
              </div>
              <span className={"status-chip " + summary.statuses[i]}>
                {attendanceLabels[summary.statuses[i]]}
              </span>
            </div>
          ))
        ) : (
          <p className="muted">Não existem aulas neste dia.</p>
        )}
      </div>
      <p className="small">
        Sem registo não significa falta. O mapa do professor usa presenças docentes, separado da
        chamada dos alunos.
      </p>
    </section>
  );
}
