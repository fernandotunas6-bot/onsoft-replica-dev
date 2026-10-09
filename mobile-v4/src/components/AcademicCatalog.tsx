import { useState } from "react";
import type { AcademicCatalog as Catalog } from "../domain/catalog";

const weekdays = [
  "",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];
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
}: {
  catalog: Catalog;
  module: string;
  onNavigate: (id: string) => void;
}) {
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
          </article>
        ))}
      {isSchedule &&
        slots.map((s) => (
          <article className="card" key={s.slotId}>
            <h2>{byId.get(s.classSubjectId)?.subjectName}</h2>
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
      {isTasks &&
        tasks.map((t) => (
          <article className="card" key={t.id}>
            <h2>{t.title}</h2>
            <p>
              {byId.get(t.classSubjectId)?.className} · {byId.get(t.classSubjectId)?.subjectName}
            </p>
            <p>{t.instructions || "Sem instruções adicionais."}</p>
            <p>{t.due ? `Prazo: ${t.due}` : "Sem prazo indicado."}</p>
          </article>
        ))}
      {((isClasses && !classes.length) ||
        (isSchedule && !slots.length) ||
        (isTasks && !tasks.length)) && (
        <p role="status">Sem resultados para os filtros seleccionados.</p>
      )}
    </section>
  );
}
