import { useState } from "react";
import type { AcademicCatalog as Catalog } from "../domain/catalog";
import {
  WEEKDAYS as weekdays,
  dueLabel,
  luandaClock,
  scheduleByDay,
  taskBuckets,
} from "../domain/agenda";

const slotChip = { now: "A decorrer", next: "A seguir" } as const;
const pending: Record<string, string> = {
  presencas: "O registo e a consulta de presenças ainda aguardam integração validada.",
  faltas: "A consulta de faltas ainda aguarda integração validada.",
  notas: "A consulta e publicação de notas ainda aguardam integração validada.",
  "notas-aluno": "A consulta de notas ainda aguarda integração validada.",
  planos: "Os planos de aula ainda aguardam integração validada.",
  mensagens: "O chat institucional ainda aguarda integração validada.",
  avisos: "Os avisos institucionais ainda aguardam integração validada.",
  documentos: "Os documentos e pedidos ainda aguardam integração validada.",
};

/** Read-only canonical data. Never turns timetable slots into attended lessons. */
export function AcademicCatalog({
  catalog,
  module,
  onNavigate,
  now,
}: {
  catalog: Catalog;
  module: string;
  onNavigate: (id: string) => void;
  /** Só para testes; por omissão a hora de Luanda. */
  now?: Date;
}) {
  const clock = luandaClock(now);
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("");
  const [day, setDay] = useState("");
  const classes = catalog.classes.filter(
    (c) =>
      (!classId || c.classSubjectId === classId) &&
      `${c.className} ${c.subjectName} ${c.teacher?.name || ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const byId = new Map(classes.map((c) => [c.classSubjectId, c]));
  const isClasses = module === "turmas" || module === "disciplinas";
  const isTasks = module === "tarefas" || module === "trabalhos";
  const isSchedule = ["aulas", "horario", "calendario"].includes(module);
  if (!isClasses && !isTasks && !isSchedule)
    return (
      <div className="card" role="status">
        <p>{pending[module] || "Este serviço ainda aguarda integração validada."}</p>
        <button
          className="pill"
          onClick={() => onNavigate(catalog.role === "professor" ? "turmas" : "disciplinas")}
        >
          Consultar disciplinas
        </button>
        <button
          className="pill"
          onClick={() => onNavigate(catalog.role === "professor" ? "aulas" : "horario")}
        >
          Consultar horário
        </button>
      </div>
    );
  const slots = catalog.timetable.filter(
    (s) => byId.has(s.classSubjectId) && (!day || s.weekday === Number(day)),
  );
  const tasks = catalog.tasks.filter((t) => byId.has(t.classSubjectId));
  const buckets = taskBuckets(tasks, clock.date);
  const classSummary = (id: string) => {
    const weekly = catalog.timetable.filter((s) => s.classSubjectId === id).length;
    const open = taskBuckets(
      catalog.tasks.filter((t) => t.classSubjectId === id),
      clock.date,
    ).open.length;
    return `${weekly} ${weekly === 1 ? "período" : "períodos"} por semana · ${open} ${
      open === 1 ? "trabalho por entregar" : "trabalhos por entregar"
    }`;
  };
  return (
    <section>
      <p className="small">
        Dados do SIGA Plus ·{" "}
        {isSchedule
          ? "Horário semanal; não confirma aulas realizadas nem presenças."
          : isTasks
            ? "Trabalhos publicados; entregas ainda não integradas."
            : "Vínculos académicos activos."}
      </p>
      <label>
        Pesquisar turma ou disciplina
        <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" />
      </label>
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
      {isSchedule && (
        <label>
          Dia da semana
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">Todos os dias</option>
            {weekdays.slice(1).map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}
      {isClasses &&
        classes.map((c) => (
          <article className="card" key={c.classSubjectId}>
            <h2>
              {c.className} · {c.subjectName}
            </h2>
            <p>{c.teacher ? `Professor: ${c.teacher.name}` : "Professor ainda não atribuído."}</p>
            {catalog.role === "professor" ? (
              <details>
                <summary>{c.students.length} alunos matriculados</summary>
                <ul>
                  {c.students.map((s) => (
                    <li key={s.enrollmentId}>{s.name}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p>Matrícula activa nesta disciplina.</p>
            )}
            <p className="small">{classSummary(c.classSubjectId)}</p>
            <div className="cardactions">
              {catalog.role === "professor" && (
                <button className="pill" onClick={() => onNavigate("presencas")}>
                  Fazer chamada
                </button>
              )}
              <button
                className="pill"
                onClick={() => onNavigate(catalog.role === "professor" ? "aulas" : "horario")}
              >
                Ver horário
              </button>
              <button
                className="pill"
                onClick={() => onNavigate(catalog.role === "professor" ? "tarefas" : "trabalhos")}
              >
                Ver trabalhos
              </button>
              <button
                className="pill"
                onClick={() => onNavigate(catalog.role === "professor" ? "notas" : "notas-aluno")}
              >
                Ver notas
              </button>
            </div>
          </article>
        ))}
      {isSchedule &&
        scheduleByDay(slots, clock).map((d) => (
          <section className="agendaday" key={d.weekday} aria-label={d.label}>
            <h3 className={d.isToday ? "today" : undefined}>{d.label}</h3>
            {d.slots.map(({ slot: s, state }) => (
              <article className={`card${state ? ` slot-${state}` : ""}`} key={s.slotId}>
                <h2>
                  {byId.get(s.classSubjectId)?.subjectName}
                  {state && <span className="status-chip">{slotChip[state]}</span>}
                </h2>
                <p>
                  {byId.get(s.classSubjectId)?.className} · {weekdays[s.weekday]} · {s.startsAt}–
                  {s.endsAt}
                </p>
                <p>{s.room ? `Sala: ${s.room}` : "Sala não indicada."}</p>
                <p className="small">
                  {s.publication === "legacy"
                    ? "Horário anterior sem publicação associada."
                    : "Horário publicado."}
                  {s.validFrom && ` Desde ${s.validFrom}.`}
                  {s.validTo && ` Até ${s.validTo}.`}
                </p>
              </article>
            ))}
          </section>
        ))}
      {isTasks &&
        (
          [
            ["Por entregar", buckets.open],
            ["Prazo terminado", buckets.closed],
          ] as const
        ).map(
          ([title, list]) =>
            list.length > 0 && (
              <section className="agendaday" key={title} aria-label={title}>
                <h3>
                  {title} · {list.length}
                </h3>
                {list.map((t) => {
                  const label = dueLabel(t.due, clock.date);
                  return (
                    <article className="card" key={t.id}>
                      <h2>
                        {t.title}
                        {label && <span className="status-chip">{label}</span>}
                      </h2>
                      <p>
                        {byId.get(t.classSubjectId)?.className} ·{" "}
                        {byId.get(t.classSubjectId)?.subjectName}
                      </p>
                      <p>{t.instructions || "Sem instruções adicionais."}</p>
                      <p>{t.due ? `Prazo: ${t.due}` : "Sem prazo indicado."}</p>
                    </article>
                  );
                })}
              </section>
            ),
        )}
      {((isClasses && !classes.length) ||
        (isSchedule && !slots.length) ||
        (isTasks && !tasks.length)) && (
        <p role="status">Sem resultados para os filtros seleccionados.</p>
      )}
    </section>
  );
}
