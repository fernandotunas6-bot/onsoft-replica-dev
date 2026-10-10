/**
 * Chamada do professor no Mobile V4 — as mesmas regras de
 * `submitAttendanceCallBatch` (Pedagógica → Presenças), sem um segundo motor:
 *
 * - só a turma-disciplina atribuída ao professor da sessão (scope + class_subjects);
 * - a sessão do dia é encontrada ou aberta como no portal (`status: pending`);
 * - pauta do período (ou anual) já oficial → recusa (`assertAttendanceNotLocked`);
 * - chamada já fechada → recusa: corrigir exige motivo e auditoria, no portal;
 * - só alunos matriculados na turma (activa ou pendente), e todos eles: a
 *   chamada não fecha com um aluno da turma por marcar (o portal permite-o);
 * - um só upsert para a turma, taxa recalculada (`recomputeAttendanceRates`) e
 *   a sessão fecha como `completed`.
 *
 * Erros conhecidos saem com código e estado HTTP; nada é convertido em sucesso.
 */
import type { requireMobileAcademicAccess } from "./authorization";
import { ROSTER_ENROLLMENT_STATUSES, type MobileAcademicScope } from "./academic-scope.server";
import type { AttendanceCallInput } from "../../../mobile-v4/src/domain/attendance";
import {
  assertAttendanceNotLocked,
  recomputeAttendanceRates,
} from "@/features/pedagogica/attendance-guards";
import { schoolTodayIso } from "@/lib/school-date";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];

type SessionRow = {
  id: string;
  class_group_id: string;
  subject_id: string;
  teacher_id: string | null;
  status: string;
  lesson_date: string;
};
const SESSION_FIELDS = "id, class_group_id, subject_id, teacher_id, status, lesson_date";

async function findSessions(
  db: Db,
  schoolId: string,
  classGroupId: string,
  subjectId: string,
  date: string,
) {
  const found = await db
    .from("siga_attendance_sessions")
    .select(SESSION_FIELDS)
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId)
    .eq("subject_id", subjectId)
    .eq("lesson_date", date)
    .limit(2);
  if (found.error || !found.data) throw new MobileApiError(503, "ATTENDANCE_UNAVAILABLE");
  // Duas sessões no mesmo dia (dois tempos): o Mobile não adivinha qual é.
  if (found.data.length > 1) throw new MobileApiError(409, "ATTENDANCE_SESSION_AMBIGUOUS");
  return (found.data[0] as SessionRow | undefined) ?? null;
}

export async function recordMobileAttendanceCall(
  db: Db,
  scope: MobileAcademicScope,
  userId: string,
  input: AttendanceCallInput,
) {
  if (scope.role !== "professor" || !scope.teacherId)
    throw new MobileApiError(403, "ROLE_FORBIDDEN");
  if (!scope.classSubjectIds.includes(input.classSubjectId))
    throw new MobileApiError(403, "CLASS_FORBIDDEN");
  if (input.date > schoolTodayIso()) throw new MobileApiError(422, "ATTENDANCE_FUTURE_DATE");

  const assignment = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id")
    .eq("school_id", scope.schoolId)
    .eq("id", input.classSubjectId)
    .eq("status", "active")
    .maybeSingle();
  if (assignment.error) throw new MobileApiError(503, "ATTENDANCE_UNAVAILABLE");
  const cs = assignment.data as {
    class_group_id: string;
    subject_id: string;
    teacher_id: string | null;
  } | null;
  if (!cs || cs.teacher_id !== scope.teacherId) throw new MobileApiError(403, "CLASS_FORBIDDEN");

  let session = await findSessions(
    db,
    scope.schoolId,
    cs.class_group_id,
    cs.subject_id,
    input.date,
  );
  if (!session) {
    const created = await db
      .from("siga_attendance_sessions")
      .insert({
        school_id: scope.schoolId,
        class_group_id: cs.class_group_id,
        subject_id: cs.subject_id,
        teacher_id: cs.teacher_id,
        lesson_date: input.date,
        status: "pending",
        created_by: userId,
      })
      .select(SESSION_FIELDS)
      .single();
    // Outro pedido abriu a mesma sessão entretanto: usa-se essa.
    session = created.error
      ? await findSessions(db, scope.schoolId, cs.class_group_id, cs.subject_id, input.date)
      : (created.data as SessionRow);
    if (!session) throw new MobileApiError(503, "ATTENDANCE_UNAVAILABLE");
  }
  if (session.teacher_id !== scope.teacherId) throw new MobileApiError(403, "CLASS_FORBIDDEN");
  if (session.status === "cancelled") throw new MobileApiError(409, "ATTENDANCE_SESSION_CANCELLED");

  try {
    await assertAttendanceNotLocked(db, scope.schoolId, session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw /já é oficial/.test(message)
      ? new MobileApiError(409, "ATTENDANCE_PERIOD_LOCKED")
      : new MobileApiError(503, "ATTENDANCE_UNAVAILABLE");
  }
  if (session.status === "completed") throw new MobileApiError(409, "ATTENDANCE_ALREADY_CLOSED");
  if (session.status !== "pending") throw new MobileApiError(503, "ATTENDANCE_INCONSISTENT");

  const enrollments = await db
    .from("enrollments")
    .select("student_id", { count: "exact" })
    .eq("school_id", scope.schoolId)
    .eq("class_group_id", session.class_group_id)
    .in("status", ROSTER_ENROLLMENT_STATUSES)
    .limit(1000);
  if (
    enrollments.error ||
    !enrollments.data ||
    enrollments.count == null ||
    enrollments.count !== enrollments.data.length
  )
    throw new MobileApiError(503, "ATTENDANCE_UNAVAILABLE");
  const enrolled = new Set(enrollments.data.map((row) => String(row.student_id)));
  if (input.records.some((r) => !enrolled.has(r.studentId)))
    throw new MobileApiError(422, "ATTENDANCE_STUDENT_NOT_ENROLLED");
  // A chamada fecha a sessão: um aluno da turma sem registo ficava sem presença
  // nem falta, e só o portal (com motivo) o podia acrescentar depois.
  const recorded = new Set(input.records.map((r) => r.studentId));
  if ([...enrolled].some((studentId) => !recorded.has(studentId)))
    throw new MobileApiError(409, "ATTENDANCE_ROSTER_CHANGED");

  const now = new Date().toISOString();
  const { error: upsertError } = await db.from("siga_attendance_records").upsert(
    input.records.map((r) => ({
      school_id: scope.schoolId,
      session_id: session.id,
      student_id: r.studentId,
      status: r.status,
      notes: null,
      recorded_by: userId,
      updated_at: now,
    })),
    { onConflict: "session_id,student_id" },
  );
  if (upsertError) throw new MobileApiError(503, "ATTENDANCE_WRITE_FAILED");
  await recomputeAttendanceRates(
    db,
    scope.schoolId,
    input.records.map((r) => r.studentId),
  );
  const { error: completeError } = await db
    .from("siga_attendance_sessions")
    .update({ status: "completed", updated_at: now, updated_by: userId })
    .eq("school_id", scope.schoolId)
    .eq("id", session.id);
  // Presenças gravadas e sessão por fechar: repetir o pedido é seguro (upsert).
  if (completeError) throw new MobileApiError(503, "ATTENDANCE_NOT_CLOSED");

  return {
    schoolId: scope.schoolId,
    userId,
    role: scope.role,
    classSubjectId: input.classSubjectId,
    sessionId: session.id,
    date: input.date,
    count: input.records.length,
    status: "completed" as const,
  };
}
