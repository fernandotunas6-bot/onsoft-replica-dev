import type { Role } from "./model";
export interface AttendanceRange {
  from: string;
  to: string;
}
export type StudentAttendanceStatus =
  | "present"
  | "absent"
  | "excused"
  | "late"
  | "early_exit"
  | "not_registered";
export type TeacherLessonStatus = "scheduled" | "confirmed" | "rejected" | "cancelled";
export interface AcademicAttendance extends AttendanceRange {
  schoolId: string;
  role: Role;
  sessions: {
    id: string;
    classSubjectId: string;
    date: string;
    startsAt: string | null;
    endsAt: string | null;
    status: "pending" | "completed" | "cancelled";
    records: { studentId: string; status: StudentAttendanceStatus }[];
  }[];
  teacherLessons: {
    id: string;
    classSubjectId: string;
    date: string;
    startsAt: string;
    endsAt: string;
    status: TeacherLessonStatus;
  }[];
}
/** Estados que o professor marca numa chamada; «sem registo» não se envia. */
export const CALL_STATUSES = ["present", "absent", "excused", "late", "early_exit"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export interface AttendanceCallInput {
  classSubjectId: string;
  /** Dia da aula (AAAA-MM-DD, calendário de Luanda); nunca no futuro. */
  date: string;
  records: { studentId: string; status: CallStatus }[];
}
export interface AttendanceCallReceipt {
  schoolId: string;
  userId: string;
  role: Role;
  classSubjectId: string;
  sessionId: string;
  date: string;
  count: number;
  status: "completed";
}
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function parseAttendanceCallReceipt(
  value: unknown,
  ctx: { schoolId: string; userId: string; role: Role },
  input: AttendanceCallInput,
): AttendanceCallReceipt {
  const v = value as AttendanceCallReceipt;
  if (
    !v ||
    typeof v !== "object" ||
    Object.keys(v).length !== 8 ||
    v.schoolId !== ctx.schoolId ||
    v.userId !== ctx.userId ||
    v.role !== ctx.role ||
    v.classSubjectId !== input.classSubjectId ||
    v.date !== input.date ||
    !UUID.test(v.sessionId) ||
    v.count !== input.records.length ||
    v.status !== "completed"
  )
    throw new Error("Resposta da chamada inválida.");
  return v;
}
