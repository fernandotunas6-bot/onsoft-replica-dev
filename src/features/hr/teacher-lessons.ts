import { isMissingHrTable } from "@/features/hr/missing-table";
import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertModuleNotBlocked,
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  createTeacherLessonQrInputSchema,
  occurrenceIdInputSchema,
  redeemTeacherLessonQrInputSchema,
} from "@/features/hr/schemas";

const HR_LESSON_ROLES = new Set(["Administrador", "Tesouraria"]);

type SgaAdminClient = Awaited<ReturnType<typeof loadSgaAdminClient>>;

async function requireHrLessonReader(userId: string, mode: "read" | "write" = "read") {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!HR_LESSON_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para consultar ocorrências remuneráveis de professores.");
  }
  // Permissões por módulo (Nenhum/Leitura) também valem no RH.
  await assertModuleNotBlocked(membership.schoolId, userId, "financeiro", mode);
  return membership;
}

function qrTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Resolve a ficha `teachers` do utilizador autenticado.
 * Preferência: teachers.user_id → people.user_id → email do login.
 * Quando encontra ficha sem user_id, faz backfill para o QR/SQL passarem a validar.
 */
export async function resolveAuthenticatedTeacherId(
  db: SgaAdminClient,
  schoolId: string,
  userId: string,
): Promise<string | null> {
  const byUser = await db
    .from("teachers")
    .select("id, user_id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!byUser.error && byUser.data?.id) return String(byUser.data.id);

  let personId: string | null = null;
  let email = "";

  const personByUser = await db
    .from("people")
    .select("id, email")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!personByUser.error && personByUser.data?.id) {
    personId = String(personByUser.data.id);
    email = String(personByUser.data.email ?? "")
      .trim()
      .toLowerCase();
  }

  if (!personId) {
    try {
      const { data: authUser } = await db.auth.admin.getUserById(userId);
      email = String(authUser.user?.email ?? "")
        .trim()
        .toLowerCase();
    } catch {
      /* ignore */
    }
    if (email) {
      const personByEmail = await db
        .from("people")
        .select("id, email")
        .eq("school_id", schoolId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (!personByEmail.error && personByEmail.data?.id) {
        personId = String(personByEmail.data.id);
      }
    }
  }

  if (!personId) return null;

  const byPerson = await db
    .from("teachers")
    .select("id, user_id")
    .eq("school_id", schoolId)
    .eq("person_id", personId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (byPerson.error || !byPerson.data?.id) return null;

  const teacherId = String(byPerson.data.id);
  if (!byPerson.data.user_id) {
    await db
      .from("teachers")
      .update({ user_id: userId })
      .eq("id", teacherId)
      .eq("school_id", schoolId);
  }
  return teacherId;
}

export type ClassroomHandoff = {
  occurrenceId: string;
  classGroupId: string;
  classGroupName: string;
  subjectId: string;
  subjectName: string;
  lessonDate: string;
  attendanceSessionId: string | null;
  startsAt: string;
  endsAt: string;
};

async function ensureAttendanceSessionForOccurrence(
  db: SgaAdminClient,
  schoolId: string,
  occurrenceId: string,
  userId: string,
): Promise<ClassroomHandoff | null> {
  const { data: occurrence, error: occurrenceError } = await db
    .from("hr_teacher_lesson_occurrences")
    .select(
      "id, class_subject_id, timetable_slot_id, lesson_date, scheduled_starts_at, scheduled_ends_at, teacher_id",
    )
    .eq("id", occurrenceId)
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .maybeSingle();
  if (occurrenceError || !occurrence) return null;

  const { data: classSubject } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id")
    .eq("id", occurrence.class_subject_id)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!classSubject) return null;

  const [{ data: classGroup }, { data: subject }] = await Promise.all([
    db.from("class_groups").select("id, name").eq("id", classSubject.class_group_id).maybeSingle(),
    db.from("subjects").select("id, name").eq("id", classSubject.subject_id).maybeSingle(),
  ]);

  const lessonDate = String(occurrence.lesson_date);
  let sessionId: string | null = null;

  if (occurrence.timetable_slot_id) {
    const { data: bySlot } = await db
      .from("siga_attendance_sessions")
      .select("id")
      .eq("school_id", schoolId)
      .eq("timetable_slot_id", occurrence.timetable_slot_id)
      .eq("lesson_date", lessonDate)
      .maybeSingle();
    if (bySlot?.id) sessionId = String(bySlot.id);
  }

  if (!sessionId) {
    const { data: byClass } = await db
      .from("siga_attendance_sessions")
      .select("id")
      .eq("school_id", schoolId)
      .eq("class_group_id", classSubject.class_group_id)
      .eq("subject_id", classSubject.subject_id)
      .eq("lesson_date", lessonDate)
      .maybeSingle();
    if (byClass?.id) sessionId = String(byClass.id);
  }

  if (!sessionId) {
    const { data: created } = await db
      .from("siga_attendance_sessions")
      .insert({
        school_id: schoolId,
        class_group_id: classSubject.class_group_id,
        subject_id: classSubject.subject_id,
        teacher_id: occurrence.teacher_id ?? classSubject.teacher_id,
        timetable_slot_id: occurrence.timetable_slot_id,
        lesson_date: lessonDate,
        starts_at: occurrence.scheduled_starts_at,
        ends_at: occurrence.scheduled_ends_at,
        status: "pending",
        created_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (created?.id) sessionId = String(created.id);
  }

  return {
    occurrenceId: String(occurrence.id),
    classGroupId: String(classSubject.class_group_id),
    classGroupName: String(classGroup?.name ?? "Turma"),
    subjectId: String(classSubject.subject_id),
    subjectName: String(subject?.name ?? "Disciplina"),
    lessonDate,
    attendanceSessionId: sessionId,
    startsAt: String(occurrence.scheduled_starts_at),
    endsAt: String(occurrence.scheduled_ends_at),
  };
}

export type HrTeacherLessonOccurrence = {
  id: string;
  teacher_id: string;
  employment_id: string;
  lesson_date: string;
  scheduled_starts_at: string;
  scheduled_ends_at: string;
  actual_started_at: string | null;
  actual_ended_at: string | null;
  quantity: number;
  status: "scheduled" | "confirmed" | "rejected" | "cancelled";
  evidence_method: "manual" | "qr" | "attendance_import" | "system" | null;
  evidence_ref: string | null;
  compensation_event_id: string | null;
  class_subject_id: string | null;
  class_group_id: string | null;
  class_group_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  attendance_session_id: string | null;
};

function mapOccurrence(row: Record<string, unknown>): HrTeacherLessonOccurrence {
  return {
    id: String(row.id),
    teacher_id: String(row.teacher_id),
    employment_id: String(row.employment_id),
    lesson_date: String(row.lesson_date),
    scheduled_starts_at: String(row.scheduled_starts_at),
    scheduled_ends_at: String(row.scheduled_ends_at),
    actual_started_at: row.actual_started_at ? String(row.actual_started_at) : null,
    actual_ended_at: row.actual_ended_at ? String(row.actual_ended_at) : null,
    quantity: Number(row.quantity ?? 1),
    status: row.status as HrTeacherLessonOccurrence["status"],
    evidence_method: (row.evidence_method ?? null) as HrTeacherLessonOccurrence["evidence_method"],
    evidence_ref: row.evidence_ref ? String(row.evidence_ref) : null,
    compensation_event_id: row.compensation_event_id ? String(row.compensation_event_id) : null,
    class_subject_id: row.class_subject_id ? String(row.class_subject_id) : null,
    class_group_id: row.class_group_id ? String(row.class_group_id) : null,
    class_group_name: row.class_group_name ? String(row.class_group_name) : null,
    subject_id: row.subject_id ? String(row.subject_id) : null,
    subject_name: row.subject_name ? String(row.subject_name) : null,
    attendance_session_id: row.attendance_session_id ? String(row.attendance_session_id) : null,
  };
}

async function enrichOccurrencesWithClassroom(
  db: SgaAdminClient,
  schoolId: string,
  rows: Record<string, unknown>[],
): Promise<HrTeacherLessonOccurrence[]> {
  const classSubjectIds = [
    ...new Set(
      rows
        .map((row) => (row.class_subject_id ? String(row.class_subject_id) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const classSubjectMap = new Map<
    string,
    { class_group_id: string; subject_id: string; class_group_name: string; subject_name: string }
  >();

  if (classSubjectIds.length) {
    const { data: classSubjects } = await db
      .from("class_subjects")
      .select("id, class_group_id, subject_id")
      .eq("school_id", schoolId)
      .in("id", classSubjectIds);

    const groupIds = [
      ...new Set((classSubjects ?? []).map((cs: { class_group_id: string }) => cs.class_group_id)),
    ];
    const subjectIds = [
      ...new Set((classSubjects ?? []).map((cs: { subject_id: string }) => cs.subject_id)),
    ];

    const [{ data: groups }, { data: subjects }] = await Promise.all([
      groupIds.length
        ? db.from("class_groups").select("id, name").in("id", groupIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      subjectIds.length
        ? db.from("subjects").select("id, name").in("id", subjectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const groupName = new Map(
      (groups ?? []).map((g: { id: string; name: string }) => [g.id, g.name]),
    );
    const subjectName = new Map(
      (subjects ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
    );

    for (const cs of classSubjects ?? []) {
      classSubjectMap.set(String(cs.id), {
        class_group_id: String(cs.class_group_id),
        subject_id: String(cs.subject_id),
        class_group_name: String(groupName.get(cs.class_group_id) ?? "Turma"),
        subject_name: String(subjectName.get(cs.subject_id) ?? "Disciplina"),
      });
    }
  }

  const sessionKeys = rows
    .map((row) => {
      const cs = row.class_subject_id ? classSubjectMap.get(String(row.class_subject_id)) : null;
      if (!cs) return null;
      return {
        occurrenceId: String(row.id),
        class_group_id: cs.class_group_id,
        subject_id: cs.subject_id,
        lesson_date: String(row.lesson_date),
        timetable_slot_id: row.timetable_slot_id ? String(row.timetable_slot_id) : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const sessionByOccurrence = new Map<string, string>();
  if (sessionKeys.length) {
    const dates = [...new Set(sessionKeys.map((k) => k.lesson_date))];
    const { data: sessions } = await db
      .from("siga_attendance_sessions")
      .select("id, class_group_id, subject_id, lesson_date, timetable_slot_id")
      .eq("school_id", schoolId)
      .in("lesson_date", dates);

    for (const key of sessionKeys) {
      const match =
        (sessions ?? []).find(
          (s: {
            id: string;
            class_group_id: string;
            subject_id: string;
            lesson_date: string;
            timetable_slot_id: string | null;
          }) =>
            key.timetable_slot_id &&
            s.timetable_slot_id === key.timetable_slot_id &&
            s.lesson_date === key.lesson_date,
        ) ??
        (sessions ?? []).find(
          (s: {
            id: string;
            class_group_id: string;
            subject_id: string;
            lesson_date: string;
            timetable_slot_id: string | null;
          }) =>
            s.class_group_id === key.class_group_id &&
            s.subject_id === key.subject_id &&
            s.lesson_date === key.lesson_date,
        );
      if (match) sessionByOccurrence.set(key.occurrenceId, String(match.id));
    }
  }

  return rows.map((row) => {
    const cs = row.class_subject_id ? classSubjectMap.get(String(row.class_subject_id)) : null;
    return mapOccurrence({
      ...row,
      class_group_id: cs?.class_group_id ?? null,
      class_group_name: cs?.class_group_name ?? null,
      subject_id: cs?.subject_id ?? null,
      subject_name: cs?.subject_name ?? null,
      attendance_session_id: sessionByOccurrence.get(String(row.id)) ?? null,
    });
  });
}

export const listHrTeacherLessonOccurrences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrTeacherLessonOccurrence[]> => {
    const membership = await requireHrLessonReader(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_teacher_lesson_occurrences")
      .select(
        "id, teacher_id, employment_id, lesson_date, scheduled_starts_at, scheduled_ends_at, actual_started_at, actual_ended_at, quantity, status, evidence_method, evidence_ref, compensation_event_id, class_subject_id, timetable_slot_id",
      )
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("lesson_date", { ascending: false })
      .order("scheduled_starts_at", { ascending: false })
      .limit(250);

    if (error) {
      if (isMissingHrTable(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as aulas remuneráveis.");
    }

    return enrichOccurrencesWithClassroom(
      db,
      membership.schoolId,
      (data ?? []) as Record<string, unknown>[],
    );
  });

export const listMyTeacherLessonOccurrences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrTeacherLessonOccurrence[]> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    const db = await loadSgaAdminClient();

    const teacherId = await resolveAuthenticatedTeacherId(db, membership.schoolId, context.userId);
    if (!teacherId) return [];

    const { data, error } = await db
      .from("hr_teacher_lesson_occurrences")
      .select(
        "id, teacher_id, employment_id, lesson_date, scheduled_starts_at, scheduled_ends_at, actual_started_at, actual_ended_at, quantity, status, evidence_method, evidence_ref, compensation_event_id, class_subject_id, timetable_slot_id",
      )
      .eq("school_id", membership.schoolId)
      .eq("teacher_id", teacherId)
      .is("deleted_at", null)
      .order("lesson_date", { ascending: false })
      .order("scheduled_starts_at", { ascending: false })
      .limit(120);

    if (error) {
      if (isMissingHrTable(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as suas aulas e presenças.");
    }

    return enrichOccurrencesWithClassroom(
      db,
      membership.schoolId,
      (data ?? []) as Record<string, unknown>[],
    );
  });

export const openMyLessonClassroom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => occurrenceIdInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ClassroomHandoff> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    const db = await loadSgaAdminClient();

    const teacherId = await resolveAuthenticatedTeacherId(db, membership.schoolId, context.userId);
    if (!teacherId) {
      throw new Error("A sua conta ainda não está ligada a uma ficha de professor.");
    }

    const { data: occurrence, error } = await db
      .from("hr_teacher_lesson_occurrences")
      .select("id, teacher_id, actual_started_at")
      .eq("id", data.occurrenceId)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw publicDatabaseError(error, "Não foi possível abrir a turma desta aula.");
    }
    if (!occurrence || String(occurrence.teacher_id) !== teacherId) {
      throw new Error("Aula não encontrada para o seu perfil.");
    }
    if (!occurrence.actual_started_at) {
      throw new Error("Faça primeiro o check-in com o QR da aula para abrir a chamada.");
    }

    const classroom = await ensureAttendanceSessionForOccurrence(
      db,
      membership.schoolId,
      String(occurrence.id),
      context.userId,
    );
    if (!classroom) throw new Error("Não foi possível localizar a turma/disciplina desta aula.");
    return classroom;
  });

export const createTeacherLessonQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createTeacherLessonQrInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireHrLessonReader(context.userId, "write");
    const db = await loadSgaAdminClient();

    const { data: occurrence, error: occurrenceError } = await db
      .from("hr_teacher_lesson_occurrences")
      .select("id, school_id, status, actual_started_at, actual_ended_at")
      .eq("id", data.occurrenceId)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .maybeSingle();

    if (occurrenceError) {
      throw publicDatabaseError(occurrenceError, "Não foi possível validar a aula para QR.");
    }
    if (!occurrence) throw new Error("Aula não encontrada.");
    if (occurrence.status === "rejected" || occurrence.status === "cancelled") {
      throw new Error("Esta aula não aceita registo de presença.");
    }
    if (data.purpose === "check_in" && occurrence.actual_started_at) {
      throw new Error("O professor já efectuou o check-in desta aula.");
    }
    if (data.purpose === "check_out" && !occurrence.actual_started_at) {
      throw new Error("O check-in deve ser efectuado antes do check-out.");
    }
    if (data.purpose === "check_out" && occurrence.actual_ended_at) {
      throw new Error("O professor já efectuou o check-out desta aula.");
    }

    // O QR anterior tem de deixar de valer antes de haver um novo: se não,
    // ficavam dois QR activos para a mesma aula.
    const { error: revokeError } = await db
      .from("hr_teacher_qr_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
      })
      .eq("school_id", membership.schoolId)
      .eq("occurrence_id", data.occurrenceId)
      .eq("purpose", data.purpose)
      .eq("status", "active");
    if (revokeError) {
      throw publicDatabaseError(revokeError, "Não foi possível anular o QR anterior.");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const { data: session, error } = await db
      .from("hr_teacher_qr_sessions")
      .insert({
        school_id: membership.schoolId,
        occurrence_id: data.occurrenceId,
        purpose: data.purpose,
        token_hash: qrTokenHash(token),
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("id, expires_at")
      .single();

    if (error) {
      throw publicDatabaseError(error, "Não foi possível gerar o QR temporário da aula.");
    }

    return {
      sessionId: String(session.id),
      token,
      purpose: data.purpose,
      expiresAt: String(session.expires_at),
    };
  });

export const redeemTeacherLessonQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => redeemTeacherLessonQrInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    const tokenHash = qrTokenHash(data.token);
    const admin = await loadSgaAdminClient();

    const teacherId = await resolveAuthenticatedTeacherId(
      admin,
      membership.schoolId,
      context.userId,
    );
    if (!teacherId) {
      throw new Error(
        "A sua conta ainda não está ligada a uma ficha de professor. Peça à secretaria para associar o login em Pessoas/Acessos.",
      );
    }

    const { data: session, error: sessionError } = await admin
      .from("hr_teacher_qr_sessions")
      .select("occurrence_id, purpose, school_id, status, expires_at")
      .eq("token_hash", tokenHash)
      .limit(1)
      .maybeSingle();
    if (sessionError) {
      throw publicDatabaseError(sessionError, "Não foi possível validar o desafio QR.");
    }
    if (!session || session.school_id !== membership.schoolId)
      throw new Error("QR não pertence a esta escola.");
    if (
      session.status !== "active" ||
      new Date(String(session.expires_at)).getTime() <= Date.now()
    ) {
      throw new Error("QR expirado ou indisponível.");
    }

    const { data: occurrenceOwner } = await admin
      .from("hr_teacher_lesson_occurrences")
      .select("teacher_id")
      .eq("id", session.occurrence_id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (!occurrenceOwner || String(occurrenceOwner.teacher_id) !== teacherId) {
      throw new Error("Este QR pertence a outra aula/professor.");
    }

    type AssuranceRpcRow = {
      assurance_score?: number | null;
      decision?: string | null;
      inside_geofence?: boolean | null;
      distance_from_school_m?: number | null;
    };
    type RedeemRpcRow = {
      occurrence_id?: string | null;
      purpose?: string | null;
      compensation_event_id?: string | null;
      occurrence_status?: string | null;
    };

    // RPCs RH ainda fora do Database.Functions tipado do cliente Supabase.
    const untypedRpc = context.supabase as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    };

    const { data: assuranceResult, error: assuranceError } = await untypedRpc.rpc(
      "hr_evaluate_teacher_attendance_assurance",
      {
        p_occurrence_id: session.occurrence_id,
        p_purpose: session.purpose,
        p_latitude: data.latitude,
        p_longitude: data.longitude,
        p_accuracy_m: data.accuracy,
      },
    );
    if (assuranceError) {
      throw publicDatabaseError(
        assuranceError,
        "Não foi possível avaliar a confiança da presença. Aplique a migration de assurance do RH.",
      );
    }
    const assurance = (
      Array.isArray(assuranceResult) ? assuranceResult[0] : assuranceResult
    ) as AssuranceRpcRow | null;
    if (!assurance) throw new Error("A presença não produziu uma avaliação de confiança.");
    if (String(assurance.decision) === "reject") {
      throw new Error("A presença não atingiu o nível mínimo de confiança e precisa ser repetida.");
    }

    const { data: result, error } = await untypedRpc.rpc("hr_redeem_teacher_qr", {
      p_token_hash: tokenHash,
    });

    if (error) {
      throw publicDatabaseError(error, "Não foi possível validar a presença por QR.");
    }

    const row = (Array.isArray(result) ? result[0] : result) as RedeemRpcRow | null;
    if (!row) throw new Error("O QR não produziu um registo de presença válido.");

    const purpose = String(row.purpose) as "check_in" | "check_out";
    let classroom: ClassroomHandoff | null = null;
    if (purpose === "check_in") {
      classroom = await ensureAttendanceSessionForOccurrence(
        admin,
        membership.schoolId,
        String(row.occurrence_id),
        context.userId,
      );
    }

    return {
      occurrenceId: String(row.occurrence_id),
      purpose,
      compensationEventId: row.compensation_event_id ? String(row.compensation_event_id) : null,
      occurrenceStatus: String(row.occurrence_status),
      classroom,
      assurance: {
        score: Number(assurance.assurance_score ?? 0),
        decision: String(assurance.decision) as "auto_approve" | "review" | "reject",
        insideGeofence:
          assurance.inside_geofence == null ? null : Boolean(assurance.inside_geofence),
        distanceFromSchoolM:
          assurance.distance_from_school_m == null
            ? null
            : Number(assurance.distance_from_school_m),
      },
    };
  });
