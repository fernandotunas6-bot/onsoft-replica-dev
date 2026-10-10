import { z } from "zod";
import { schoolTodayIso } from "@/lib/school-date";
import { requireMobileAcademicAccess } from "./authorization";
import { resolveMobileAcademicScope } from "./academic-scope.server";
import { readMobileAcademicCatalog } from "./academic-catalog.server";
import { MobileApiError } from "./errors";
import { mobileScopeSchema, type MobileCommandRequest } from "./schemas";

/**
 * Chamada do professor na app móvel. A lógica é a do portal
 * (`prepareTeacherDaySessions` e `recordAttendanceCall` em
 * `features/pedagogica/attendance-core.server.ts`): dono da aula, pauta oficial e só
 * alunos matriculados verificados no servidor. Aqui só se acrescenta o âmbito
 * do catálogo móvel e a tradução dos estados e dos erros.
 */

const MOBILE_TO_SIGA = { presente: "present", ausente: "absent", justificada: "excused" } as const;
const MAX_RECORDS = 1000;

type AttendanceCommand = Extract<MobileCommandRequest["command"], { type: "attendance" }>;

async function attendanceCore() {
  return import("@/features/pedagogica/attendance-core.server");
}

/** Aulas de hoje do professor, com as sessões de chamada preparadas como no portal. */
export async function loadMobileV4TeacherDay(userId: string, input: unknown) {
  const requested = mobileScopeSchema.parse(input);
  if (requested.role !== "professor") throw new MobileApiError(403, "TEACHER_ONLY");
  const { db } = await requireMobileAcademicAccess(userId, requested.schoolId, "professor", "read");
  const scope = await resolveMobileAcademicScope(db, userId, requested.schoolId, "professor");
  const catalog = await readMobileAcademicCatalog(db, scope, userId);
  const byGroupAndSubject = new Map(
    catalog.classes.map((item) => [`${item.classGroupId}:${item.subjectId}`, item.classSubjectId]),
  );
  const { prepareTeacherDaySessions } = await attendanceCore();
  const date = schoolTodayIso();
  const day = await prepareTeacherDaySessions(
    db,
    { schoolId: requested.schoolId, appRole: "Professor", userId, teacherId: scope.teacherId },
    { date },
  );
  // Só sessões reais (não o id do horário) de disciplinas do catálogo autorizado.
  const lessons = day.sessions
    .filter((session) => session.id !== session.timetable_slot_id)
    .map((session) => ({
      sessionId: session.id,
      classSubjectId: byGroupAndSubject.get(`${session.class_group_id}:${session.subject_id}`),
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      room: session.room,
      status: session.status,
    }))
    .filter(
      (lesson): lesson is typeof lesson & { classSubjectId: string } =>
        typeof lesson.classSubjectId === "string",
    );
  const records: { session_id: string; student_id: string; status: string }[] = [];
  if (lessons.length) {
    const { data, error } = await db
      .from("siga_attendance_records")
      .select("session_id, student_id, status")
      .eq("school_id", requested.schoolId)
      .in(
        "session_id",
        lessons.map((lesson) => lesson.sessionId),
      )
      .limit(MAX_RECORDS + 1);
    if (error) throw new MobileApiError(503, "ATTENDANCE_UNAVAILABLE");
    if ((data ?? []).length > MAX_RECORDS) throw new MobileApiError(503, "ATTENDANCE_TOO_LARGE");
    records.push(...((data ?? []) as typeof records));
  }
  return {
    schoolId: requested.schoolId,
    date,
    lessons: lessons.map((lesson) => ({
      ...lesson,
      records: records
        .filter((row) => row.session_id === lesson.sessionId)
        .map((row) => ({ studentId: String(row.student_id), status: String(row.status) })),
    })),
  };
}

/**
 * Grava e fecha a chamada. Repetir o mesmo pedido (rede que caiu depois de
 * gravar) devolve sucesso sem nova escrita; uma chamada já fechada com outros
 * estados só se corrige no portal, com motivo e auditoria.
 */
export async function recordMobileV4Attendance(
  userId: string,
  request: MobileCommandRequest & { command: AttendanceCommand },
) {
  const { db } = await requireMobileAcademicAccess(userId, request.schoolId, "professor", "write");
  // Ficha de docente pelo âmbito móvel (403 sem ficha ligada à conta).
  const scope = await resolveMobileAcademicScope(db, userId, request.schoolId, "professor");
  const sessionId = z.string().uuid().safeParse(request.command.lessonId);
  if (!sessionId.success) throw new MobileApiError(422, "INVALID_LESSON");
  const records = request.command.entries.map((entry) => {
    const studentId = z.string().uuid().safeParse(entry.studentId);
    if (!studentId.success) throw new MobileApiError(422, "INVALID_STUDENT");
    return { studentId: studentId.data, status: MOBILE_TO_SIGA[entry.status] };
  });
  const { recordAttendanceCall, AttendanceCallError } = await attendanceCore();
  try {
    const result = await recordAttendanceCall(
      db,
      { schoolId: request.schoolId, appRole: "Professor", userId, teacherId: scope.teacherId },
      { sessionId: sessionId.data, records },
    );
    return { ok: true, sessionId: result.sessionId, count: result.count, replayed: false };
  } catch (error) {
    if (!(error instanceof AttendanceCallError)) throw error;
    if (error.code === "ALREADY_CLOSED") {
      if (await sameRecords(db, request.schoolId, sessionId.data, records)) {
        return { ok: true, sessionId: sessionId.data, count: records.length, replayed: true };
      }
      throw new MobileApiError(409, "ATTENDANCE_ALREADY_CLOSED");
    }
    const status = { SESSION_NOT_FOUND: 404, NOT_SESSION_TEACHER: 403, NOT_ENROLLED: 422 } as const;
    if (error.code === "PERIOD_LOCKED") throw new MobileApiError(409, "PERIOD_LOCKED");
    throw new MobileApiError(status[error.code], error.code);
  }
}

async function sameRecords(
  db: Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"],
  schoolId: string,
  sessionId: string,
  records: { studentId: string; status: string }[],
): Promise<boolean> {
  const { data, error } = await db
    .from("siga_attendance_records")
    .select("student_id, status")
    .eq("school_id", schoolId)
    .eq("session_id", sessionId)
    .in(
      "student_id",
      records.map((record) => record.studentId),
    );
  if (error) throw new MobileApiError(503, "ATTENDANCE_UNAVAILABLE");
  const stored = new Map((data ?? []).map((row) => [String(row.student_id), String(row.status)]));
  return records.every((record) => stored.get(record.studentId) === record.status);
}
