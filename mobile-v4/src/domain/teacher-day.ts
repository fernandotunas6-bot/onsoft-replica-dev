import type { AcademicCatalog } from "./catalog";
import type { StudentAttendanceStatus } from "./attendance";
import type { AttendanceStatus, Context } from "./model";

/** Aulas de hoje do professor com a sessão de chamada criada pelo servidor. */
export interface TeacherDay {
  schoolId: string;
  date: string;
  lessons: TeacherDayLesson[];
}
export interface TeacherDayLesson {
  sessionId: string;
  classSubjectId: string;
  startsAt: string | null;
  endsAt: string | null;
  room: string | null;
  status: "pending" | "completed" | "cancelled";
  records: { studentId: string; status: StudentAttendanceStatus }[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessionStatuses = ["pending", "completed", "cancelled"] as const;
const recordStatuses: readonly StudentAttendanceStatus[] = [
  "present",
  "absent",
  "excused",
  "late",
  "early_exit",
  "not_registered",
];

function fail(): never {
  throw new Error("Contrato das aulas de hoje inválido.");
}
const optionalText = (value: unknown) =>
  value === null ? null : typeof value === "string" ? value : fail();

/** Falha fechada: escola, disciplina, sessão e aluno têm de vir do âmbito autorizado. */
export function parseTeacherDay(data: unknown, ctx: Context, catalog: AcademicCatalog): TeacherDay {
  if (ctx.role !== "professor") fail();
  if (!data || typeof data !== "object" || Array.isArray(data)) fail();
  const raw = data as Record<string, unknown>;
  if (raw.schoolId !== ctx.schoolId || catalog.schoolId !== ctx.schoolId) fail();
  if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) fail();
  if (!Array.isArray(raw.lessons)) fail();
  const classes = new Map(catalog.classes.map((c) => [c.classSubjectId, c]));
  const seen = new Set<string>();
  const lessons = raw.lessons.map((item): TeacherDayLesson => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail();
    const lesson = item as Record<string, unknown>;
    if (typeof lesson.sessionId !== "string" || !uuid.test(lesson.sessionId)) fail();
    if (seen.has(lesson.sessionId)) fail();
    seen.add(lesson.sessionId);
    const group = typeof lesson.classSubjectId === "string" && classes.get(lesson.classSubjectId);
    if (!group) fail();
    if (!sessionStatuses.includes(lesson.status as never)) fail();
    if (!Array.isArray(lesson.records)) fail();
    const roster = new Set(group.students.map((s) => s.studentId));
    const marked = new Set<string>();
    const records = lesson.records.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail();
      const record = entry as Record<string, unknown>;
      if (typeof record.studentId !== "string" || marked.has(record.studentId)) fail();
      if (!recordStatuses.includes(record.status as StudentAttendanceStatus)) fail();
      marked.add(record.studentId);
      return { studentId: record.studentId, status: record.status as StudentAttendanceStatus };
    });
    return {
      sessionId: lesson.sessionId,
      classSubjectId: group.classSubjectId,
      startsAt: optionalText(lesson.startsAt),
      endsAt: optionalText(lesson.endsAt),
      room: optionalText(lesson.room),
      status: lesson.status as TeacherDayLesson["status"],
      // Marcações de quem já saiu da turma não se mostram nem se reenviam.
      records: records.filter((record) => roster.has(record.studentId)),
    };
  });
  return { schoolId: ctx.schoolId, date: raw.date, lessons };
}

/** Marcação já gravada → escolha na app; atraso e saída antecipada contam como presença. */
export function initialMark(status: StudentAttendanceStatus | undefined): AttendanceStatus | null {
  if (status === "present" || status === "late" || status === "early_exit") return "presente";
  if (status === "absent") return "ausente";
  if (status === "excused") return "justificada";
  return null;
}
