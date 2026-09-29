import { z } from "zod";
import {
  assertCanSeeStudent,
  loadStudentScope,
  resolveVerifiedAccountEmail,
} from "@/features/students/student-scope";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { resolveUserLinkedEntities } from "@/features/auth/server";

export const attendanceStatusEnum = z.enum([
  "present",
  "absent",
  "excused",
  "late",
  "early_exit",
  "not_registered",
]);

export type AttendanceStatus = z.infer<typeof attendanceStatusEnum>;

export const listTeacherAttendanceSessionsInputSchema = z.object({
  date: z.string().optional(), // YYYY-MM-DD
  classGroupId: z.string().uuid().optional(),
});

export const getAttendanceCallSheetInputSchema = z.object({
  sessionId: z.string().uuid().optional(),
  classGroupId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  date: z.string().optional(),
});

export const submitAttendanceCallBatchInputSchema = z.object({
  sessionId: z.string().uuid(),
  markAllPresent: z.boolean().optional(),
  records: z.array(
    z.object({
      studentId: z.string().uuid(),
      status: attendanceStatusEnum,
      notes: z.string().optional(),
    }),
  ),
});

export const editFinalizedAttendanceCallInputSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.string().min(5, "O motivo deve ter pelo menos 5 caracteres."),
  records: z.array(
    z.object({
      studentId: z.string().uuid(),
      status: attendanceStatusEnum,
      notes: z.string().optional(),
    }),
  ),
});

export const submitAttendanceJustificationInputSchema = z.object({
  studentId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  attendanceRecordId: z.string().uuid().optional(),
  reason: z.string().min(8, "A justificativa deve ter pelo menos 8 caracteres."),
  fileId: z.string().uuid().optional(),
  fileName: z.string().optional(),
});

export const reviewAttendanceJustificationInputSchema = z.object({
  justificationId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  reviewNotes: z.string().optional(),
});

export const getStudentAttendanceHistoryInputSchema = z.object({
  studentId: z.string().uuid().optional(),
});

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

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * Recalcula a taxa de presença de vários alunos numa só instrução
 * (`siga_recompute_attendance_rates`, migração 20260928230000). Antes eram duas
 * idas à base por aluno, e a leitura sujeita ao limite de 1000 linhas do
 * PostgREST. Se a função ainda não existir, faz o cálculo antigo aluno a aluno.
 * A taxa é derivada: uma falha aqui não desfaz a chamada já gravada.
 */
async function recomputeAttendanceRates(db: AdminDb, schoolId: string, studentIds: string[]) {
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

    const rate = computeAttendanceRate(records);
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

export const listTeacherAttendanceSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listTeacherAttendanceSessionsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    // As aulas do dia (e as sessões que se criam para elas) são do corpo
    // docente: aluno e encarregado não chegam aqui, como na folha de chamada.
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();

    const today = data.date || new Date().toISOString().slice(0, 10);
    const dateObj = new Date(`${today}T12:00:00Z`);
    const weekday = dateObj.getDay(); // 0 = Domingo, 1 = Segunda...

    let classSubjectQuery = db
      .from("class_subjects")
      .select("id, class_group_id, subject_id, teacher_id")
      .eq("school_id", membership.schoolId)
      .eq("status", "active");

    // O professor vê só as suas aulas; sem ficha de docente ligada, nenhuma
    // (antes via as da escola inteira).
    if (membership.appRole === "Professor") {
      const linked = await resolveUserLinkedEntities(db, membership.schoolId, context.userId);
      if (!linked.teacher_id) return { sessions: [], date: today, pendingCount: 0 };
      classSubjectQuery = classSubjectQuery.eq("teacher_id", linked.teacher_id);
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

    const groupMap = new Map(
      (groups ?? []).map((g: { id: string; name: string }) => [g.id, g.name]),
    );
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
      .eq("school_id", membership.schoolId)
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
              school_id: membership.schoolId,
              class_group_id: cs.class_group_id,
              subject_id: cs.subject_id,
              teacher_id: cs.teacher_id,
              timetable_slot_id: slot.id,
              lesson_date: today,
              starts_at: slot.starts_at,
              ends_at: slot.ends_at,
              status: "pending",
              created_by: context.userId,
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
          .eq("school_id", membership.schoolId)
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
  });

export const getAttendanceCallSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getAttendanceCallSheetInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    // A folha de chamada lista a turma inteira: é do corpo docente, não dos alunos.
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    const db = await loadSgaAdminClient();

    let sessionRow: {
      id: string;
      class_group_id: string;
      subject_id: string;
      teacher_id: string | null;
      lesson_date: string;
      period_number: number;
      starts_at: string | null;
      ends_at: string | null;
      status: string;
      notes: string | null;
    } | null = null;

    if (data.sessionId) {
      const { data: s } = await db
        .from("siga_attendance_sessions")
        .select("*")
        .eq("id", data.sessionId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      sessionRow = s;
    } else if (data.classGroupId && data.subjectId) {
      const today = data.date || new Date().toISOString().slice(0, 10);
      const { data: s } = await db
        .from("siga_attendance_sessions")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("class_group_id", data.classGroupId)
        .eq("subject_id", data.subjectId)
        .eq("lesson_date", today)
        .maybeSingle();
      sessionRow = s;

      if (!sessionRow) {
        // Só se abre sessão para uma turma e disciplina desta escola.
        const [{ data: ownGroup }, { data: ownSubject }] = await Promise.all([
          db
            .from("class_groups")
            .select("id")
            .eq("id", data.classGroupId)
            .eq("school_id", membership.schoolId)
            .maybeSingle(),
          db
            .from("subjects")
            .select("id")
            .eq("id", data.subjectId)
            .eq("school_id", membership.schoolId)
            .maybeSingle(),
        ]);
        if (!ownGroup || !ownSubject) throw new Error("Turma ou disciplina não encontrada.");

        const { data: created } = await db
          .from("siga_attendance_sessions")
          .insert({
            school_id: membership.schoolId,
            class_group_id: data.classGroupId,
            subject_id: data.subjectId,
            lesson_date: today,
            status: "pending",
            created_by: context.userId,
          })
          .select("*")
          .single();
        sessionRow = created;
      }
    }

    if (!sessionRow) {
      throw new Error("Sessão de chamada não encontrada.");
    }

    const [{ data: classGroup }, { data: subject }] = await Promise.all([
      db.from("class_groups").select("id, name").eq("id", sessionRow.class_group_id).single(),
      db.from("subjects").select("id, name").eq("id", sessionRow.subject_id).single(),
    ]);

    const { data: enrollments } = await db
      .from("enrollments")
      .select("id, student_id")
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", sessionRow.class_group_id)
      .in("status", ["active", "pending"]);

    const studentIds = (enrollments ?? []).map((e: { student_id: string }) => e.student_id);

    const { data: studentRows } = studentIds.length
      ? await db.from("students").select("id, student_number, person_id").in("id", studentIds)
      : { data: [] as Array<{ id: string; student_number: string; person_id: string }> };

    const personIds = (studentRows ?? []).map((s: { person_id: string }) => s.person_id);
    const { loadPeopleLite } = await import("@/features/people/lookup");
    const peopleMap = await loadPeopleLite(db, membership.schoolId, personIds);

    const { data: existingRecords } = await db
      .from("siga_attendance_records")
      .select("id, student_id, status, notes")
      .eq("school_id", membership.schoolId)
      .eq("session_id", sessionRow.id);

    const recordByStudentMap = new Map(
      (existingRecords ?? []).map(
        (r: { student_id: string; status: string; notes: string | null }) => [r.student_id, r],
      ),
    );

    const studentsList = (studentRows ?? [])
      .map((st: { id: string; student_number: string; person_id: string }) => {
        const p = peopleMap.get(st.person_id);
        const rec = recordByStudentMap.get(st.id);
        return {
          student_id: st.id,
          student_number: st.student_number ?? "",
          full_name: p?.full_name ?? "Aluno",
          photo_url: p?.photo_url ?? null,
          status: (rec?.status as AttendanceStatus) || "not_registered",
          notes: rec?.notes ?? null,
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-PT"));

    return {
      session: {
        id: sessionRow.id,
        class_group_id: sessionRow.class_group_id,
        class_group_name: classGroup?.name ?? "Turma",
        subject_id: sessionRow.subject_id,
        subject_name: subject?.name ?? "Disciplina",
        lesson_date: sessionRow.lesson_date,
        period_number: sessionRow.period_number,
        starts_at: sessionRow.starts_at,
        ends_at: sessionRow.ends_at,
        status: sessionRow.status,
        notes: sessionRow.notes,
      },
      students: studentsList,
      totalCount: studentsList.length,
    };
  });

export const submitAttendanceCallBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => submitAttendanceCallBatchInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();

    const { data: session, error: sErr } = await db
      .from("siga_attendance_sessions")
      .select("id, school_id, class_group_id, subject_id, teacher_id, status")
      .eq("id", data.sessionId)
      .eq("school_id", membership.schoolId)
      .single();

    if (sErr || !session) throw new Error("Sessão de chamada não encontrada.");

    if (membership.appRole === "Professor") {
      const linked = await resolveUserLinkedEntities(db, membership.schoolId, context.userId);
      if (linked.teacher_id && session.teacher_id && linked.teacher_id !== session.teacher_id) {
        throw new Error("Não tem permissão para realizar a chamada de outro professor.");
      }
    }

    // Só alunos matriculados nesta turma entram na chamada.
    const { data: classEnrollments } = await db
      .from("enrollments")
      .select("student_id")
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", session.class_group_id)
      .in("status", ["active", "pending"]);
    const enrolled = new Set((classEnrollments ?? []).map((row) => String(row.student_id)));
    const outsiders = data.records.filter((item) => !enrolled.has(item.studentId));
    if (outsiders.length) {
      throw new Error("A chamada inclui alunos que não estão matriculados nesta turma.");
    }

    // Uma só escrita para a turma inteira. Antes era um upsert por aluno, com o
    // erro ignorado: uma linha recusada pela base não impedia o "ok".
    const now = new Date().toISOString();
    if (data.records.length) {
      const { error: upsertError } = await db.from("siga_attendance_records").upsert(
        data.records.map((item) => ({
          school_id: membership.schoolId,
          session_id: session.id,
          student_id: item.studentId,
          status: data.markAllPresent && item.status === "not_registered" ? "present" : item.status,
          notes: item.notes ?? null,
          recorded_by: context.userId,
          updated_at: now,
        })),
        { onConflict: "session_id,student_id" },
      );
      if (upsertError) throw publicDatabaseError(upsertError, "Não foi possível gravar a chamada.");
    }
    await recomputeAttendanceRates(
      db,
      membership.schoolId,
      data.records.map((item) => item.studentId),
    );

    await db
      .from("siga_attendance_sessions")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", session.id);

    return { ok: true, sessionId: session.id, count: data.records.length };
  });

export const editFinalizedAttendanceCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => editFinalizedAttendanceCallInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();

    const { data: session } = await db
      .from("siga_attendance_sessions")
      .select("id, school_id, lesson_date, created_at, class_group_id, teacher_id")
      .eq("id", data.sessionId)
      .eq("school_id", membership.schoolId)
      .single();

    if (!session) throw new Error("Sessão de chamada não encontrada.");

    // As mesmas regras da chamada normal: o professor só corrige as suas
    // chamadas, e só entram alunos matriculados nesta turma.
    if (membership.appRole === "Professor") {
      const linked = await resolveUserLinkedEntities(db, membership.schoolId, context.userId);
      if (linked.teacher_id && session.teacher_id && linked.teacher_id !== session.teacher_id) {
        throw new Error("Não tem permissão para corrigir a chamada de outro professor.");
      }
    }
    const { data: classEnrollments } = await db
      .from("enrollments")
      .select("student_id")
      .eq("school_id", membership.schoolId)
      .eq("class_group_id", session.class_group_id)
      .in("status", ["active", "pending"]);
    const enrolled = new Set((classEnrollments ?? []).map((row) => String(row.student_id)));
    if (data.records.some((item) => !enrolled.has(item.studentId))) {
      throw new Error("A correcção inclui alunos que não estão matriculados nesta turma.");
    }

    const { data: existingRecords } = await db
      .from("siga_attendance_records")
      .select("id, student_id, status")
      .eq("session_id", session.id);

    const recordMap = new Map(
      (existingRecords ?? []).map((r: { id: string; student_id: string; status: string }) => [
        r.student_id,
        r,
      ]),
    );

    const changes = data.records
      .map((item) => {
        const prev = recordMap.get(item.studentId);
        return { item, prev, oldStatus: prev?.status ?? "not_registered" };
      })
      .filter(({ item, oldStatus }) => oldStatus !== item.status);

    if (changes.length) {
      const now = new Date().toISOString();
      const { error: upsertError } = await db.from("siga_attendance_records").upsert(
        changes.map(({ item }) => ({
          school_id: membership.schoolId,
          session_id: session.id,
          student_id: item.studentId,
          status: item.status,
          notes: item.notes ?? null,
          recorded_by: context.userId,
          updated_at: now,
        })),
        { onConflict: "session_id,student_id" },
      );
      if (upsertError) {
        throw publicDatabaseError(upsertError, "Não foi possível corrigir a chamada.");
      }

      const { error: auditError } = await db.from("siga_attendance_audits").insert(
        changes.map(({ item, prev, oldStatus }) => ({
          school_id: membership.schoolId,
          session_id: session.id,
          attendance_record_id: prev?.id ?? null,
          student_id: item.studentId,
          old_status: oldStatus,
          new_status: item.status,
          reason: data.reason.trim(),
          changed_by: context.userId,
        })),
      );
      if (auditError)
        console.warn("[attendance] auditoria da correcção falhou:", auditError.message);

      await recomputeAttendanceRates(
        db,
        membership.schoolId,
        changes.map(({ item }) => item.studentId),
      );
    }

    return { ok: true, editedCount: data.records.length };
  });

export const submitAttendanceJustification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => submitAttendanceJustificationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa.");
    const db = await loadSgaAdminClient();
    assertCanSeeStudent(await loadStudentScope(db, membership, context.userId), data.studentId);
    // A aprovação marca este registo como justificado: tem de ser do próprio aluno.
    if (data.attendanceRecordId) {
      const { data: record } = await db
        .from("siga_attendance_records")
        .select("id")
        .eq("id", data.attendanceRecordId)
        .eq("school_id", membership.schoolId)
        .eq("student_id", data.studentId)
        .maybeSingle();
      if (!record) throw new Error("Registo de presença não encontrado para este aluno.");
    }

    const { data: justification, error } = await db
      .from("siga_attendance_justifications")
      .insert({
        school_id: membership.schoolId,
        student_id: data.studentId,
        session_id: data.sessionId ?? null,
        attendance_record_id: data.attendanceRecordId ?? null,
        reason: data.reason.trim(),
        file_id: data.fileId ?? null,
        file_name: data.fileName ?? null,
        status: "pending",
        submitted_by: context.userId,
      })
      .select("id, status")
      .single();

    if (error) throw publicDatabaseError(error, "Não foi possível enviar a justificativa.");
    return justification;
  });

export const reviewAttendanceJustification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewAttendanceJustificationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();

    const { data: just } = await db
      .from("siga_attendance_justifications")
      .select("id, school_id, student_id, attendance_record_id, session_id")
      .eq("id", data.justificationId)
      .eq("school_id", membership.schoolId)
      .single();

    if (!just) throw new Error("Justificativa não encontrada.");

    await db
      .from("siga_attendance_justifications")
      .update({
        status: data.status,
        review_notes: data.reviewNotes ?? null,
        reviewed_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", just.id);

    if (data.status === "approved" && just.attendance_record_id) {
      await db
        .from("siga_attendance_records")
        .update({ status: "excused", updated_at: new Date().toISOString() })
        .eq("id", just.attendance_record_id);

      await recomputeAttendanceRates(db, membership.schoolId, [just.student_id]);
    }

    return { ok: true, status: data.status };
  });

export const getStudentAttendanceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getStudentAttendanceHistoryInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa.");
    const db = await loadSgaAdminClient();

    const linked = await resolveUserLinkedEntities(
      db,
      membership.schoolId,
      context.userId,
      await resolveVerifiedAccountEmail(db, context.userId),
    );
    let targetStudentId = data.studentId || linked.student_id;

    if (membership.appRole === "Encarregado") {
      const allowedIds = linked.linked_students.map((s) => s.student_id);
      if (targetStudentId && !allowedIds.includes(targetStudentId)) {
        throw new Error("Não tem permissão para consultar dados deste educando.");
      }
      if (!targetStudentId && allowedIds.length > 0) {
        targetStudentId = allowedIds[0];
      }
    } else if (membership.appRole === "Aluno") {
      if (linked.student_id) targetStudentId = linked.student_id;
    }
    if (targetStudentId) {
      assertCanSeeStudent(await loadStudentScope(db, membership, context.userId), targetStudentId);
    }

    if (!targetStudentId) {
      return {
        records: [],
        stats: { total: 0, present: 0, absent: 0, excused: 0, late: 0, rate: 100 },
      };
    }

    const { data: records } = await db
      .from("siga_attendance_records")
      .select("id, session_id, status, notes, created_at")
      .eq("school_id", membership.schoolId)
      .eq("student_id", targetStudentId)
      .order("created_at", { ascending: false })
      .limit(100);

    const sessionIds = [
      ...new Set((records ?? []).map((r: { session_id: string }) => r.session_id)),
    ];

    const { data: sessions } = sessionIds.length
      ? await db
          .from("siga_attendance_sessions")
          .select("id, class_group_id, subject_id, lesson_date, starts_at")
          .in("id", sessionIds)
      : {
          data: [] as Array<{
            id: string;
            class_group_id: string;
            subject_id: string;
            lesson_date: string;
            starts_at: string | null;
          }>,
        };

    const subjectIds = [
      ...new Set((sessions ?? []).map((s: { subject_id: string }) => s.subject_id)),
    ];
    const { data: subjects } = subjectIds.length
      ? await db.from("subjects").select("id, name").in("id", subjectIds)
      : { data: [] as Array<{ id: string; name: string }> };

    const subjectMap = new Map(
      (subjects ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
    );
    const sessionMap = new Map(
      (sessions ?? []).map(
        (s: { id: string; subject_id: string; lesson_date: string; starts_at: string | null }) => [
          s.id,
          s,
        ],
      ),
    );

    let present = 0;
    let absent = 0;
    let excused = 0;
    let late = 0;

    const formattedRecords = (records ?? []).map(
      (r: {
        id: string;
        session_id: string;
        status: string;
        notes: string | null;
        created_at: string;
      }) => {
        const sess = sessionMap.get(r.session_id);
        const subjectName = sess ? (subjectMap.get(sess.subject_id) ?? "Disciplina") : "Aula";
        const status = r.status as AttendanceStatus;

        if (status === "present") present += 1;
        else if (status === "absent") absent += 1;
        else if (status === "excused") excused += 1;
        else if (status === "late") late += 1;

        return {
          id: r.id,
          session_id: r.session_id,
          subject_name: subjectName,
          date: sess?.lesson_date ?? r.created_at.slice(0, 10),
          time: sess?.starts_at ?? "",
          status,
          notes: r.notes ?? null,
        };
      },
    );

    const total = formattedRecords.length;
    const rate = total > 0 ? Math.round(((present + excused + late) / total) * 100) : 100;

    return {
      records: formattedRecords,
      stats: { total, present, absent, excused, late, rate },
    };
  });
