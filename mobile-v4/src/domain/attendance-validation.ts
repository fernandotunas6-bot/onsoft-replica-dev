import type { AcademicAttendance, AttendanceRange } from "./attendance";
import type { AcademicCatalog } from "./catalog";
import type { Context } from "./model";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) =>
  Object.keys(v).length === expected.length && expected.every((k) => k in v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const date = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const time = (v: unknown) =>
  v === null ||
  (typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(v));
const seconds = (v: string) => {
  const [h, m, s = "0"] = v.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};
export function parseAcademicAttendance(
  value: unknown,
  ctx: Context,
  catalog: AcademicCatalog,
  range: AttendanceRange,
): AcademicAttendance {
  const invalid = (): never => {
    throw new Error("Contrato de presenças inválido.");
  };
  if (
    !object(value) ||
    !keys(value, ["schoolId", "role", "from", "to", "sessions", "teacherLessons"]) ||
    value.schoolId !== ctx.schoolId ||
    value.role !== ctx.role ||
    catalog.schoolId !== ctx.schoolId ||
    catalog.role !== ctx.role ||
    value.from !== range.from ||
    value.to !== range.to ||
    !date(value.from) ||
    !date(value.to) ||
    value.to < value.from ||
    Date.parse(value.to) - Date.parse(value.from) > 30 * 86400000 ||
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.teacherLessons) ||
    value.sessions.length > 1000 ||
    value.teacherLessons.length > 1000
  )
    return invalid();
  const classes = new Map(catalog.classes.map((c) => [c.classSubjectId, c]));
  const seen = new Set<string>();
  for (const session of value.sessions) {
    if (
      !object(session) ||
      !keys(session, ["id", "classSubjectId", "date", "startsAt", "endsAt", "status", "records"]) ||
      !uuid(session.id) ||
      seen.has(session.id) ||
      !uuid(session.classSubjectId) ||
      !classes.has(session.classSubjectId) ||
      !date(session.date) ||
      session.date < range.from ||
      session.date > range.to ||
      !time(session.startsAt) ||
      !time(session.endsAt) ||
      !["pending", "completed", "cancelled"].includes(String(session.status)) ||
      !Array.isArray(session.records) ||
      session.records.length > 1000
    )
      return invalid();
    if (
      typeof session.startsAt === "string" &&
      typeof session.endsAt === "string" &&
      seconds(session.endsAt) <= seconds(session.startsAt)
    )
      return invalid();
    seen.add(session.id);
    const c = classes.get(session.classSubjectId)!;
    if (ctx.role === "professor" && c.teacher?.userId !== ctx.userId) return invalid();
    if (session.status !== "completed" && session.records.length) return invalid();
    const students = new Set<string>();
    for (const r of session.records) {
      if (
        !object(r) ||
        !keys(r, ["studentId", "status"]) ||
        !uuid(r.studentId) ||
        students.has(r.studentId) ||
        !["present", "absent", "excused", "late", "early_exit", "not_registered"].includes(
          String(r.status),
        )
      )
        return invalid();
      const student = c.students.find((s) => s.studentId === r.studentId);
      if (!student || (ctx.role === "aluno" && student.userId !== ctx.userId)) return invalid();
      students.add(r.studentId);
    }
  }
  seen.clear();
  if (ctx.role === "aluno" && value.teacherLessons.length) return invalid();
  for (const l of value.teacherLessons) {
    if (
      !object(l) ||
      !keys(l, ["id", "classSubjectId", "date", "startsAt", "endsAt", "status"]) ||
      !uuid(l.id) ||
      seen.has(l.id) ||
      !uuid(l.classSubjectId) ||
      classes.get(l.classSubjectId)?.teacher?.userId !== ctx.userId ||
      !date(l.date) ||
      l.date < range.from ||
      l.date > range.to ||
      !time(l.startsAt) ||
      l.startsAt === null ||
      !time(l.endsAt) ||
      l.endsAt === null ||
      seconds(String(l.endsAt)) <= seconds(String(l.startsAt)) ||
      !["scheduled", "confirmed", "rejected", "cancelled"].includes(String(l.status))
    )
      return invalid();
    seen.add(l.id);
  }
  return value as unknown as AcademicAttendance;
}
