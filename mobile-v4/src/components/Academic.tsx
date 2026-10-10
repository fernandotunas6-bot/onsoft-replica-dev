import { useState, type FormEvent } from "react";
import type { Workspace, Context, Command, AttendanceStatus } from "../domain/model";
import { parseGrade } from "../domain/policy";
export const teacherModules = [
  ["Aulas de hoje", "book-open", "aulas"],
  ["Presenças", "users", "presencas"],
  ["Lançar notas", "pencil", "notas"],
  ["Minhas turmas", "school", "turmas"],
  ["Plano de aula", "panel-top", "planos"],
  ["Tarefas", "check", "tarefas"],
  ["Mensagens", "messages-square", "mensagens"],
  ["Calendário", "bell", "calendario"],
];
export const studentModules = [
  ["Meu horário", "book-open", "horario"],
  ["Minhas notas", "star", "notas-aluno"],
  ["Trabalhos", "pencil", "trabalhos"],
  ["Disciplinas", "grid-2x2", "disciplinas"],
  ["Presenças", "check", "faltas"],
  ["Avisos", "bell", "avisos"],
  ["Mensagens", "messages-square", "mensagens"],
  ["Documentos", "panel-top", "documentos"],
];
export function Academic({
  module,
  data,
  ctx,
  execute,
  busy,
  onNavigate,
}: {
  module: string;
  data: Workspace;
  ctx: Context;
  execute: (c: Command) => Promise<boolean>;
  busy: boolean;
  onNavigate: (id: string) => void;
}) {
  const [classId, setClass] = useState(data.classes[0]?.id || "");
  const [lessonId, setLesson] = useState(data.lessons[0]?.id || "");
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [note, setNote] = useState("");
  const [studentId, setStudent] = useState("");
  const [published, setPublished] = useState(false);
  const [objectives, setObjectives] = useState("");
  const [materials, setMaterials] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [taskId, setTask] = useState(data.tasks[0]?.id || "");
  const [answer, setAnswer] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [doc, setDoc] = useState("Declaração de frequência");
  const [error, setError] = useState("");
  const group = data.classes.find((g) => g.id === classId);
  const lesson = data.lessons.find((l) => l.id === lessonId);
  const lessonGroup = data.classes.find((g) => g.id === lesson?.classId);
  async function submit(e: FormEvent, command: () => Command) {
    e.preventDefault();
    setError("");
    try {
      const ok = await execute(command());
      if (ok) {
        setMessage("");
        setAnswer("");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const save = (label = "Guardar") => (
    <button className="pill primary" type="submit" disabled={busy}>
      {busy ? "A guardar…" : label}
    </button>
  );
  const classSelect = (
    <label>
      Turma
      <select
        value={classId}
        onChange={(e) => {
          setClass(e.target.value);
          setStudent("");
          setNote("");
        }}
      >
        {data.classes.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} · {g.subject}
          </option>
        ))}
      </select>
    </label>
  );
  const lessonSelect = (
    <label>
      Aula
      <select
        value={lessonId}
        onChange={(e) => {
          setLesson(e.target.value);
          setMarks({});
          const p = data.plans.find((p) => p.lessonId === e.target.value);
          setObjectives(p?.objectives || "");
          setMaterials(p?.materials || "");
        }}
      >
        {data.lessons.map((l) => (
          <option key={l.id} value={l.id}>
            {l.date} · {l.time} · {data.classes.find((g) => g.id === l.classId)?.name}
          </option>
        ))}
      </select>
    </label>
  );
  if (!data.classes.length)
    return <div className="card">Não existem turmas atribuídas a este perfil.</div>;
  return (
    <div className="academic">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {["aulas", "horario", "calendario"].includes(module) && (
        <>
          {data.lessons.length ? (
            data.lessons.map((l) => (
              <article className="card" key={l.id}>
                <div className="small">
                  {l.date} · {l.time}
                </div>
                <h3>
                  {data.classes.find((g) => g.id === l.classId)?.subject} ·{" "}
                  {data.classes.find((g) => g.id === l.classId)?.name}
                </h3>
                <p>{l.topic}</p>
                <p className="muted">{l.room}</p>
                {ctx.role === "professor" && (
                  <div className="flow-actions">
                    <button className="pill" onClick={() => onNavigate("presencas")}>
                      Fazer chamada
                    </button>
                    <button className="pill" onClick={() => onNavigate("planos")}>
                      Plano de aula
                    </button>
                    <button className="pill" onClick={() => onNavigate("notas")}>
                      Lançar notas
                    </button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <p>Sem aulas agendadas.</p>
          )}
        </>
      )}
      {["turmas", "disciplinas"].includes(module) &&
        data.classes.map((g) => (
          <article className="card" key={g.id}>
            <h3>
              {g.name} · {g.subject}
            </h3>
            {ctx.role === "professor" ? (
              <>
                <p>{g.students.length} alunos</p>
                {g.students.map((s) => (
                  <p key={s.id}>{s.name}</p>
                ))}
              </>
            ) : (
              <p>Disciplina da tua matrícula activa.</p>
            )}
          </article>
        ))}
      {["presencas", "faltas"].includes(module) && (
        <button className="pill" onClick={() => onNavigate("calendario")}>
          Ver mapa de aulas
        </button>
      )}
      {module === "presencas" && (
        <form
          onSubmit={(e) =>
            submit(e, () => ({
              type: "attendance",
              lessonId,
              entries: (lessonGroup?.students || []).map((s) => ({
                studentId: s.id,
                status:
                  marks[s.id] ||
                  data.attendance.find((a) => a.lessonId === lessonId && a.studentId === s.id)
                    ?.status ||
                  "presente",
              })),
            }))
          }
        >
          {lessonSelect}
          <p className="muted">Revê cada aluno antes de confirmar a chamada.</p>
          {lessonGroup?.students.map((s) => (
            <label className="card" key={s.id}>
              {s.name}
              <select
                value={
                  marks[s.id] ||
                  data.attendance.find((a) => a.lessonId === lessonId && a.studentId === s.id)
                    ?.status ||
                  "presente"
                }
                onChange={(e) =>
                  setMarks({
                    ...marks,
                    [s.id]: e.target.value as AttendanceStatus,
                  })
                }
              >
                <option value="presente">Presente</option>
                <option value="ausente">Ausente</option>
                <option value="justificada">Falta justificada</option>
              </select>
            </label>
          ))}
          {save("Confirmar chamada")}
          <button type="button" className="pill" onClick={() => onNavigate("notas")}>
            Continuar para notas
          </button>
        </form>
      )}
      {module === "notas" && (
        <form
          onSubmit={(e) =>
            submit(e, () => ({
              type: "grade",
              classId,
              studentId,
              value: parseGrade(note),
              published,
              expectedRevision:
                data.grades.find((g) => g.classId === classId && g.studentId === studentId)
                  ?.revision || 0,
            }))
          }
        >
          {classSelect}
          <label>
            Aluno
            <select
              required
              value={studentId}
              onChange={(e) => {
                setStudent(e.target.value);
                const g = data.grades.find(
                  (g) => g.classId === classId && g.studentId === e.target.value,
                );
                setNote(g ? String(g.value) : "");
                setPublished(g?.published || false);
              }}
            >
              <option value="">Seleccionar aluno</option>
              {group?.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nota (0–20)
            <input
              required
              inputMode="decimal"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: 15,5"
            />
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />{" "}
            Publicar para o aluno
          </label>
          {save("Guardar nota")}
          <p className="muted">
            A gravação real deve respeitar o período lectivo e a auditoria do SIGA.
          </p>
        </form>
      )}
      {module === "notas-aluno" && (
        <>
          {data.grades.length ? (
            data.grades.map((g) => (
              <article className="card" key={g.classId + g.studentId}>
                <h3>{data.classes.find((c) => c.id === g.classId)?.subject}</h3>
                <div className="grade">
                  {g.value}
                  <small> / 20</small>
                </div>
                <p className="muted">Nota publicada pelo professor</p>
              </article>
            ))
          ) : (
            <p>Sem notas publicadas.</p>
          )}
        </>
      )}
      {module === "planos" && (
        <>
          <form
            onSubmit={(e) =>
              submit(e, () => ({
                type: "plan",
                lessonId,
                objectives,
                materials,
              }))
            }
          >
            {lessonSelect}
            <label>
              Objectivos
              <textarea
                required
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                maxLength={4000}
              />
            </label>
            <label>
              Materiais e metodologia
              <textarea
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                maxLength={4000}
              />
            </label>
            {save("Guardar plano")}
          </form>
          {data.plans.map((p) => (
            <article className="card" key={p.lessonId}>
              <h3>Plano guardado</h3>
              <p>{p.objectives}</p>
              <p>{p.materials}</p>
              <button
                className="pill"
                onClick={() => {
                  setLesson(p.lessonId);
                  setObjectives(p.objectives);
                  setMaterials(p.materials);
                }}
              >
                Editar plano
              </button>
            </article>
          ))}
        </>
      )}
      {module === "tarefas" && (
        <>
          <form
            onSubmit={(e) =>
              submit(e, () => ({
                type: "task",
                classId,
                title,
                instructions,
                due,
              }))
            }
          >
            {classSelect}
            <label>
              Título
              <input
                required
                value={title}
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Instruções
              <textarea
                required
                value={instructions}
                maxLength={4000}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </label>
            <label>
              Prazo
              <input
                type="date"
                required
                value={due}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            {save("Publicar tarefa")}
          </form>
          {data.tasks.map((t) => (
            <article className="card" key={t.id}>
              <h3>{t.title}</h3>
              <p>{t.instructions}</p>
              <p className="muted">Entrega: {t.due}</p>
              {data.submissions
                .filter((s) => s.taskId === t.id)
                .map((s) => (
                  <div className="card" key={s.studentId}>
                    <b>
                      {
                        data.classes.flatMap((g) => g.students).find((a) => a.id === s.studentId)
                          ?.name
                      }
                    </b>
                    <p>{s.text}</p>
                  </div>
                ))}
            </article>
          ))}
        </>
      )}
      {module === "trabalhos" && (
        <>
          <label>
            Trabalho
            <select
              value={taskId}
              onChange={(e) => {
                setTask(e.target.value);
                setAnswer(data.submissions.find((s) => s.taskId === e.target.value)?.text || "");
              }}
            >
              {data.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          {data.tasks
            .filter((t) => t.id === taskId)
            .map((t) => (
              <article className="card" key={t.id}>
                <p>{t.instructions}</p>
                <p className="muted">Prazo: {t.due}</p>
                <form
                  onSubmit={(e) =>
                    submit(e, () => ({
                      type: "submission",
                      taskId,
                      text: answer,
                    }))
                  }
                >
                  <label>
                    A tua resposta
                    <textarea
                      required
                      value={answer}
                      maxLength={4000}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                  </label>
                  {save(
                    data.submissions.some((s) => s.taskId === taskId)
                      ? "Actualizar entrega"
                      : "Entregar trabalho",
                  )}
                </form>
                {data.submissions
                  .filter((s) => s.taskId === taskId)
                  .map((s) => (
                    <div key={s.studentId}>
                      <p className="success">
                        Entrega registada · {new Date(s.submittedAt).toLocaleString("pt-AO")}
                      </p>
                      <p>{s.text}</p>
                    </div>
                  ))}
              </article>
            ))}
          {!data.tasks.length && <p>Sem trabalhos publicados.</p>}
        </>
      )}
      {module === "faltas" && (
        <>
          {data.attendance.length ? (
            data.attendance.map((a) => (
              <article className="card" key={a.lessonId + a.studentId}>
                <b>{data.lessons.find((l) => l.id === a.lessonId)?.date}</b>
                <p>{a.status}</p>
              </article>
            ))
          ) : (
            <p>Ainda não há presenças registadas.</p>
          )}
        </>
      )}
      {module === "avisos" && (
        <>
          {data.announcements.map((a, i) => (
            <article className="card" key={i}>
              {a}
            </article>
          ))}
          {!data.announcements.length && <p>Sem avisos.</p>}
        </>
      )}
      {module === "mensagens" && (
        <>
          <form onSubmit={(e) => submit(e, () => ({ type: "message", to, text: message }))}>
            <label>
              Destinatário
              <select required value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Seleccionar destinatário</option>
                {Array.from(
                  new Map(
                    data.classes.flatMap((g) =>
                      ctx.role === "professor"
                        ? g.students.map((s) => [s.userId, s.name] as const)
                        : [[g.teacherUserId, "Professor · " + g.subject] as const],
                    ),
                  ).entries(),
                ).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mensagem
              <textarea
                required
                value={message}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            {save("Enviar mensagem")}
          </form>
          {data.messages.map((m) => (
            <article className="card" key={m.id}>
              <b>{m.from === ctx.userId ? "Enviada" : "Recebida"}</b>
              <p>{m.text}</p>
              <p className="muted">{new Date(m.sentAt).toLocaleString("pt-AO")}</p>
            </article>
          ))}
        </>
      )}
      {module === "documentos" && (
        <>
          <form onSubmit={(e) => submit(e, () => ({ type: "document", documentType: doc }))}>
            <label>
              Documento
              <select value={doc} onChange={(e) => setDoc(e.target.value)}>
                {["Declaração de frequência", "Boletim", "Histórico escolar"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            {save("Solicitar documento")}
          </form>
          {data.documents.map((d) => (
            <article className="card" key={d.id}>
              <b>{d.type}</b>
              <p>{d.status} · aguarda a secretaria</p>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
