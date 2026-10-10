import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { schoolTodayIso } from "@/lib/school-date";
import { LOCKED_SHEET_STATUSES } from "@/features/academic/sga-grades";
import type {
  AttendanceStatus,
  listTeacherAttendanceSessionsInputSchema,
  submitAttendanceCallBatchInputSchema,
} from "./attendance-server";
import type { z } from "zod";

/**
 * Núcleo da chamada, partilhado pelo portal (`attendance-server.ts`) e pela app
 * móvel (`features/mobile-v4/teacher-attendance.server.ts`). Sem server functions
 * nem middleware: quem chama já autenticou, verificou o papel e resolveu a ficha
 * de docente.
 */

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * Presente, dispensado (justificado) e atrasado contam a favor da assiduidade; só a ausência
 * sem justificação penaliza a taxa. "not_registered" já é excluído antes de chegar aqui.
 */
export function computeAttendanceRate(records: Array<{ status: AttendanceStatus }>): number | null {
  if (records.length === 0) return null;
  const presentCount = records.filter(
    (r) => r.status === "present" || r.status === "excused" || r.status === "late",
  ).length;
  return Math.round((presentCount / records.length) * 100);
}

/** Professores só podem abrir ou alterar sessões explicitamente atribuídas à sua ficha. */
export function teacherOwnsAttendanceSession(
  linkedTeacherId: string | null | undefined,
  sessionTeacherId: string | null | undefined,
): boolean {
  return Boolean(linkedTeacherId && sessionTeacherId && linkedTeacherId === sessionTeacherId);
}

/** Recusa da chamada com motivo estável; a mensagem é a mesma que o portal mostra. */
export class AttendanceCallError extends Error {
  constructor(
    public readonly code:
      | "SESSION_NOT_FOUND"
      | "ALREADY_CLOSED"
      | "NOT_SESSION_TEACHER"
      | "NOT_ENROLLED"
      | "PERIOD_LOCKED",
    message: string,
  ) {
    super(message);
    this.name = "AttendanceCallError";
  }
}

/**
 * Recalcula a taxa de presença de vários alunos numa só instrução
 * (`siga_recompute_attendance_rates`, migração 20260928230000). Antes eram duas
 * idas à base por aluno, e a leitura sujeita ao limite de 1000 linhas do
 * PostgREST. Se a função ainda não existir, faz o cálculo antigo aluno a aluno.
 * A taxa é derivada: uma falha aqui não desfaz a chamada já gravada.
 */
export async function recomputeAttendanceRates(
  db: AdminDb,
  schoolId: string,
  studentIds: string[],
) {
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return;
  const { error } = await db.rpc("siga_recompute_attendance_rates", {
    p_school_id: schoolId,
    p_student_ids: ids,
  });
  if (!error) return;
  if (error.code !== "PGRST202" && error.code !== "42883") {
    console.warn("[attendance] recálculo da taxa falhou:", error.message);
    return;
  }
  for (const studentId of ids) {
    await recomputeStudentAttendanceRateLegacy(db, schoolId, studentId);
  }
}

async function recomputeStudentAttendanceRateLegacy(
  db: AdminDb,
  schoolId: string,
  studentId: string,
) {
  try {
    const { data: records } = await db
      .from("siga_attendance_records")
      .select("status")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .neq("status", "not_registered");

    if (!records || records.length === 0) return;

    // `status` é texto com CHECK na base; os valores são os de AttendanceStatus.
    const rate = computeAttendanceRate(records as Array<{ status: AttendanceStatus }>);
    if (rate === null) return;

    await db
      .from("enrollments")
      .update({ attendance_rate: rate, updated_at: new Date().toISOString() })
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("status", "active");
  } catch {
    /* ignore fallback calculation error */
  }
}

/**
 * As faltas entram na pauta (o detalhe da pauta lê-as da chamada, ao vivo). Uma
 * chamada, uma correcção ou uma justificação num período cuja pauta (do período
 * ou anual) já é oficial mudava a percentagem de faltas de uma pauta homologada
 * ou publicada (auditoria 13). A regra é a das notas (`LOCKED_SHEET_STATUSES`).
 */
export async function assertAttendanceNotLocked(
  db: AdminDb,
  schoolId: string,
  session: { class_group_id: unknown; lesson_date?: unknown },
): Promise<void> {
  const classGroupId = session.class_group_id ? String(session.class_group_id) : "";
  const lessonDate = session.lesson_date ? String(session.lesson_date).slice(0, 10) : "";
  if (!classGroupId || !lessonDate) return;
  const { data: group } = await db
    .from("class_groups")
    .select("academic_year_id")
    .eq("school_id", schoolId)
    .eq("id", classGroupId)
    .maybeSingle();
  if (!group?.academic_year_id) return;
  const { data: term } = await db
    .from("terms")
    .select("id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", String(group.academic_year_id))
    .lte("starts_on", lessonDate)
    .gte("ends_on", lessonDate)
    .limit(1)
    .maybeSingle();
  const { data: sheets, error } = await db
    .from("grade_sheets")
    .select("kind, term_id")
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId)
    .in("status", LOCKED_SHEET_STATUSES);
  if (error) {
    throw publicDatabaseError(error, "Não foi possível confirmar se a pauta já é oficial.");
  }
  const locked = (sheets ?? []).some(
    (sheet: { kind: string; term_id: string | null }) =>
      sheet.kind === "annual" || (term?.id && String(sheet.term_id) === String(term.id)),
  );
  if (locked) {
    throw new AttendanceCallError(
      "PERIOD_LOCKED",
      "A pauta deste período já é oficial: as presenças desta aula já não se alteram. Peça a alteração na pauta (Pedagógica → Pautas), com o motivo.",
    );
  }
}

/** Quem grava ou prepara a chamada: escola, papel no SIGA e conta (do servidor). */
export type AttendanceActor = {
  schoolId: string;
  appRole: string;
  userId: string;
  /** Ficha de docente de quem grava (resolvida por quem chama); só conta para Professor. */
  teacherId: string | null;
};

/**
 * Aulas do dia do professor (ou da escola, para a Direcção/Secretaria), criando as
 * sessões de chamada que faltam. Partilhado pelo portal e pela app móvel.
 */
export async function prepareTeacherDaySessions(
  db: AdminDb,
  actor: AttendanceActor,
  data: z.infer<typeof listTeacherAttendanceSessionsInputSchema>,
) {
  const today = data.date || schoolTodayIso();
  const dateObj = new Date(`${today}T12:00:00Z`);
  const weekday = dateObj.getDay(); // 0 = Domingo, 1 = Segunda...

  let classSubjectQuery = db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id")
    .eq("school_id", actor.schoolId)
    .eq("status", "active");

  // O professor vê só as suas aulas; sem ficha de docente ligada, nenhuma
  // (antes via as da escola inteira).
  if (actor.appRole === "Professor") {
    if (!actor.teacherId) return { sessions: [], date: today, pendingCount: 0 };
    classSubjectQuery = classSubjectQuery.eq("teacher_id", actor.teacherId);
  }
  if (data.classGroupId) {
    classSubjectQuery = classSubjectQuery.eq("class_group_id", data.classGroupId);
  }

  const { data: classSubjects, error: csError } = await classSubjectQuery;
  if (csError)
    throw publicDatabaseError(csError, "Não foi possível carregar turmas e disciplinas.");

  const classSubjectIds = (classSubjects ?? []).map((cs: { id: string }) => cs.id);
  if (classSubjectIds.length === 0) {
    return { sessions: [], date: today, pendingCount: 0 };
  }

  const { data: slots } = await db
    .from("timetable_slots")
    .select("id, class_subject_id, weekday, starts_at, ends_at, room")
    .in("class_subject_id", classSubjectIds)
    .eq("weekday", weekday)
    .eq("status", "active")
    .order("starts_at");

  const classGroupIds = [
    ...new Set((classSubjects ?? []).map((cs: { class_group_id: string }) => cs.class_group_id)),
  ];
  const subjectIds = [
    ...new Set((classSubjects ?? []).map((cs: { subject_id: string }) => cs.subject_id)),
  ];

  const [{ data: groups }, { data: subjects }] = await Promise.all([
    db.from("class_groups").select("id, name").in("id", classGroupIds),
    db.from("subjects").select("id, name").in("id", subjectIds),
  ]);

  const groupMap = new Map((groups ?? []).map((g: { id: string; name: string }) => [g.id, g.name]));
  const subjectMap = new Map(
    (subjects ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
  );
  const csMap = new Map(
    (classSubjects ?? []).map(
      (cs: {
        id: string;
        class_group_id: string;
        subject_id: string;
        teacher_id: string | null;
      }) => [cs.id, cs],
    ),
  );

  const { data: existingSessions } = await db
    .from("siga_attendance_sessions")
    .select(
      "id, class_group_id, subject_id, timetable_slot_id, lesson_date, status, starts_at, ends_at",
    )
    .eq("school_id", actor.schoolId)
    .eq("lesson_date", today);

  const sessionBySlotMap = new Map<string, { id: string; status: string }>(
    (existingSessions ?? [])
      .filter((s: { timetable_slot_id: string | null }) => s.timetable_slot_id)
      .map((s: { timetable_slot_id: string | null; id: string; status: string }) => [
        s.timetable_slot_id!,
        s,
      ]),
  );

  // Sessões que faltam para as aulas do dia: uma só escrita, com erro
  // verificado (antes era uma por aula e as falhas passavam em silêncio).
  const missing = (slots ?? []).filter(
    (slot: { id: string; class_subject_id: string }) =>
      csMap.has(slot.class_subject_id) && !sessionBySlotMap.has(slot.id),
  );
  if (missing.length) {
    let { data: created, error: createError } = await db
      .from("siga_attendance_sessions")
      .insert(
        missing.map((slot) => {
          const cs = csMap.get(slot.class_subject_id)!;
          return {
            school_id: actor.schoolId,
            class_group_id: cs.class_group_id,
            subject_id: cs.subject_id,
            teacher_id: cs.teacher_id,
            timetable_slot_id: slot.id,
            lesson_date: today,
            starts_at: slot.starts_at,
            ends_at: slot.ends_at,
            status: "pending",
            created_by: actor.userId,
          };
        }),
      )
      .select("id, status, timetable_slot_id");
    // Outro pedido criou-as entretanto (índice único por escola, aula e dia,
    // migração 20260929230000): lêem-se as que ficaram.
    if (createError?.code === "23505") {
      ({ data: created, error: createError } = await db
        .from("siga_attendance_sessions")
        .select("id, status, timetable_slot_id")
        .eq("school_id", actor.schoolId)
        .eq("lesson_date", today)
        .in(
          "timetable_slot_id",
          missing.map((slot) => slot.id),
        ));
    }
    if (createError) {
      throw publicDatabaseError(createError, "Não foi possível preparar as aulas do dia.");
    }
    for (const row of (created ?? []) as Array<{
      id: string;
      status: string;
      timetable_slot_id: string | null;
    }>) {
      if (row.timetable_slot_id) sessionBySlotMap.set(row.timetable_slot_id, row);
    }
  }

  const sessionsList: Array<{
    id: string;
    class_group_id: string;
    class_group_name: string;
    subject_id: string;
    subject_name: string;
    timetable_slot_id: string | null;
    starts_at: string;
    ends_at: string;
    room: string | null;
    status: "pending" | "completed" | "cancelled";
    lesson_date: string;
  }> = [];

  let pendingCount = 0;

  for (const slot of slots ?? []) {
    const cs = csMap.get(slot.class_subject_id);
    if (!cs) continue;

    const existing = sessionBySlotMap.get(slot.id);
    const sessionId = existing?.id;
    const status: "pending" | "completed" | "cancelled" =
      (existing?.status as "pending" | "completed" | "cancelled" | undefined) ?? "pending";

    if (status === "pending") pendingCount += 1;

    sessionsList.push({
      id: sessionId ?? slot.id,
      class_group_id: cs.class_group_id,
      class_group_name: groupMap.get(cs.class_group_id) ?? "Turma",
      subject_id: cs.subject_id,
      subject_name: subjectMap.get(cs.subject_id) ?? "Disciplina",
      timetable_slot_id: slot.id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      room: slot.room ?? null,
      status,
      lesson_date: today,
    });
  }

  return { sessions: sessionsList, date: today, pendingCount };
}

/**
 * Grava e fecha a chamada de uma sessão aberta. Partilhado pelo portal e pela app
 * móvel: as mesmas regras (dono da aula, pauta oficial, só matriculados) em ambos.
 */
export async function recordAttendanceCall(
  db: AdminDb,
  actor: AttendanceActor,
  data: z.infer<typeof submitAttendanceCallBatchInputSchema>,
) {
  const { data: session, error: sErr } = await db
    .from("siga_attendance_sessions")
    .select("id, school_id, class_group_id, subject_id, teacher_id, status, lesson_date")
    .eq("id", data.sessionId)
    .eq("school_id", actor.schoolId)
    .single();

  if (sErr || !session) {
    throw new AttendanceCallError("SESSION_NOT_FOUND", "Sessão de chamada não encontrada.");
  }
  await assertAttendanceNotLocked(db, actor.schoolId, session);
  // Chamada já fechada: mudar presenças é uma correcção, com motivo e
  // auditoria (editFinalizedAttendanceCall). Antes, reenviar a chamada
  // reescrevia-a sem rasto.
  if (session.status === "completed") {
    throw new AttendanceCallError(
      "ALREADY_CLOSED",
      "Esta chamada já foi fechada. Use «Corrigir chamada» e indique o motivo.",
    );
  }

  if (actor.appRole === "Professor") {
    if (!teacherOwnsAttendanceSession(actor.teacherId, session.teacher_id)) {
      throw new AttendanceCallError(
        "NOT_SESSION_TEACHER",
        "Não tem permissão para realizar a chamada de outro professor.",
      );
    }
  }

  // Só alunos matriculados nesta turma entram na chamada.
  const { data: classEnrollments } = await db
    .from("enrollments")
    .select("student_id")
    .eq("school_id", actor.schoolId)
    .eq("class_group_id", session.class_group_id)
    .in("status", ["active", "pending"]);
  const enrolled = new Set((classEnrollments ?? []).map((row) => String(row.student_id)));
  const outsiders = data.records.filter((item) => !enrolled.has(item.studentId));
  if (outsiders.length) {
    throw new AttendanceCallError(
      "NOT_ENROLLED",
      "A chamada inclui alunos que não estão matriculados nesta turma.",
    );
  }

  // Uma só escrita para a turma inteira. Antes era um upsert por aluno, com o
  // erro ignorado: uma linha recusada pela base não impedia o "ok".
  const now = new Date().toISOString();
  if (data.records.length) {
    const { error: upsertError } = await db.from("siga_attendance_records").upsert(
      data.records.map((item) => ({
        school_id: actor.schoolId,
        session_id: session.id,
        student_id: item.studentId,
        status: data.markAllPresent && item.status === "not_registered" ? "present" : item.status,
        notes: item.notes ?? null,
        recorded_by: actor.userId,
        updated_at: now,
      })),
      { onConflict: "session_id,student_id" },
    );
    if (upsertError) throw publicDatabaseError(upsertError, "Não foi possível gravar a chamada.");
  }
  await recomputeAttendanceRates(
    db,
    actor.schoolId,
    data.records.map((item) => item.studentId),
  );

  // Sem isto a chamada ficava "pendente" com as presenças gravadas; repetir é
  // seguro (o upsert acima é idempotente), por isso o erro sobe.
  const { error: completeError } = await db
    .from("siga_attendance_sessions")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
    })
    .eq("id", session.id);
  if (completeError) {
    throw publicDatabaseError(completeError, "Presenças gravadas, mas a chamada não fechou.");
  }

  return { ok: true, sessionId: session.id, count: data.records.length };
}
