import { useMemo, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import { CALL_STATUSES, type AcademicAttendance, type CallStatus } from "../domain/attendance";
import type { Context, Gateway } from "../domain/model";
import { ApiError } from "../services/api";

const labels: Record<CallStatus, string> = {
  present: "Presente",
  absent: "Falta",
  excused: "Falta justificada",
  late: "Atraso",
  early_exit: "Saída antecipada",
};

/** Mensagem para cada recusa conhecida do servidor. */
export function attendanceCallError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Não foi possível gravar a chamada.";
  }
  switch (error.code) {
    case "ATTENDANCE_ALREADY_CLOSED":
      return "Esta chamada já foi fechada. Para a corrigir, use «Corrigir chamada» no portal e indique o motivo.";
    case "ATTENDANCE_PERIOD_LOCKED":
      return "A pauta deste período já é oficial: as presenças desta aula já não se alteram. Peça a alteração na pauta, no portal.";
    case "ATTENDANCE_SESSION_AMBIGUOUS":
      return "Há mais de uma aula desta turma neste dia. Faça esta chamada no portal.";
    case "ATTENDANCE_SESSION_CANCELLED":
      return "Esta aula foi cancelada: não tem chamada.";
    case "ATTENDANCE_FUTURE_DATE":
      return "Não é possível fazer a chamada de um dia que ainda não chegou.";
    case "ATTENDANCE_STUDENT_NOT_ENROLLED":
    case "ATTENDANCE_ROSTER_CHANGED":
      return "A lista de alunos da turma mudou. Actualize as presenças e volte a fazer a chamada.";
    case "MFA_REQUIRED":
      return "Para gravar a chamada, entre com o segundo factor (código ou chave de acesso).";
    case "CLASS_FORBIDDEN":
    case "ROLE_FORBIDDEN":
    case "COMMAND_ROLE_FORBIDDEN":
      return "Esta turma não está atribuída a si.";
    case "MODULE_FORBIDDEN":
      return "A escola não lhe permite gravar na Pedagógica neste momento.";
  }
  return error.message;
}

/**
 * Turmas do professor com aula no dia: horário publicado em vigor nesse dia da
 * semana, ocorrências docentes ou chamada pendente. As que já têm a chamada
 * fechada (ou a aula cancelada) ficam de fora.
 */
export function callableClasses(
  catalog: AcademicCatalog,
  attendance: AcademicAttendance,
  date: string,
) {
  const weekday = ((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
  const ids = new Set<string>();
  for (const slot of catalog.timetable)
    if (
      slot.weekday === weekday &&
      (!slot.validFrom || slot.validFrom <= date) &&
      (!slot.validTo || slot.validTo >= date)
    )
      ids.add(slot.classSubjectId);
  for (const lesson of attendance.teacherLessons)
    if (lesson.date === date && lesson.status !== "cancelled") ids.add(lesson.classSubjectId);
  for (const session of attendance.sessions)
    if (session.date === date && session.status === "pending") ids.add(session.classSubjectId);
  const closed = new Set(
    attendance.sessions
      .filter((s) => s.date === date && s.status !== "pending")
      .map((s) => s.classSubjectId),
  );
  return catalog.classes.filter(
    (c) => ids.has(c.classSubjectId) && !closed.has(c.classSubjectId) && c.students.length > 0,
  );
}

export function AttendanceCall({
  ctx,
  gateway,
  catalog,
  attendance,
  date,
  today,
  onSaved,
}: {
  ctx: Context;
  gateway: Gateway;
  catalog: AcademicCatalog;
  attendance: AcademicAttendance;
  date: string;
  today: string;
  onSaved: (message: string) => void;
}) {
  const classes = useMemo(
    () => callableClasses(catalog, attendance, date),
    [catalog, attendance, date],
  );
  const [open, setOpen] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, CallStatus>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (ctx.role !== "professor" || !gateway.recordAttendanceCall || date > today) return null;
  if (!classes.length) return <p>Sem turmas com chamada por fazer neste dia.</p>;
  const current = classes.find((c) => c.classSubjectId === open) ?? null;
  const pending = attendance.sessions.find(
    (s) => s.date === date && s.classSubjectId === open && s.status === "pending",
  );
  const statusOf = (studentId: string): CallStatus => {
    if (marks[studentId]) return marks[studentId];
    const saved = pending?.records.find((r) => r.studentId === studentId)?.status;
    return saved && saved !== "not_registered" ? saved : "present";
  };
  const start = (classSubjectId: string) => {
    setOpen(classSubjectId);
    setMarks({});
    setConfirming(false);
    setError("");
  };
  const counts = current
    ? CALL_STATUSES.map((status) => ({
        status,
        n: current.students.filter((s) => statusOf(s.studentId) === status).length,
      })).filter((x) => x.n > 0)
    : [];
  const save = async () => {
    if (!current || !gateway.recordAttendanceCall) return;
    setBusy(true);
    setError("");
    try {
      const receipt = await gateway.recordAttendanceCall(ctx, {
        classSubjectId: current.classSubjectId,
        date,
        records: current.students.map((s) => ({
          studentId: s.studentId,
          status: statusOf(s.studentId),
        })),
      });
      setOpen(null);
      setConfirming(false);
      onSaved(
        `Chamada de ${current.className} · ${current.subjectName} gravada e fechada (${receipt.count} alunos).`,
      );
    } catch (e) {
      setError(attendanceCallError(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      {!current && (
        <div className="flow-actions">
          {classes.map((c) => (
            <button key={c.classSubjectId} className="pill" onClick={() => start(c.classSubjectId)}>
              Fazer chamada · {c.className} · {c.subjectName}
            </button>
          ))}
        </div>
      )}
      {current && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirming) void save();
            else setConfirming(true);
          }}
        >
          <h3>
            Chamada · {current.className} · {current.subjectName}
          </h3>
          <p className="muted">Revê cada aluno antes de gravar. Por omissão, todos presentes.</p>
          {current.students.map((s) => (
            <label className="card" key={s.studentId}>
              {s.name}
              <select
                aria-label={`Presença de ${s.name}`}
                value={statusOf(s.studentId)}
                disabled={busy}
                onChange={(e) => {
                  setMarks({ ...marks, [s.studentId]: e.target.value as CallStatus });
                  setConfirming(false);
                }}
              >
                {CALL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {labels[status]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {confirming && (
            <p role="status">
              {counts.map((x) => `${x.n} ${labels[x.status].toLowerCase()}`).join(" · ")}. Depois de
              gravada, a chamada fica fechada e só se corrige no portal, com motivo.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="flow-actions">
            <button className="pill" type="submit" disabled={busy}>
              {busy ? "A gravar…" : confirming ? "Confirmar e gravar" : "Gravar e fechar chamada"}
            </button>
            <button
              className="pill"
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(null);
                setConfirming(false);
                setError("");
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
