/**
 * Aulas do horário: detalhes (tipo, modo, ligação, tema), tarefas da turma,
 * horário semanal do professor e configuração dos lembretes.
 *
 * Escrever: professor da disciplina naquela turma, Administrador ou
 * Secretaria. Ler: pessoal da escola; aluno e encarregado só as aulas da turma
 * do aluno. As tabelas novas são só do servidor (migração 20260926140000).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import { loadHiddenTeachers } from "@/features/people/teacher-contact-visibility";
import { todayInLuanda } from "@/features/calendar/dates";
import { groupTimetableByDay, type StudentTimetable } from "@/features/dashboard/student-agenda";
import {
  DELIVERY_MODES,
  LESSON_TYPES,
  TASK_KINDS,
  DEFAULT_REMINDER_SETTINGS,
  buildPublishedMessage,
  type ReminderSettings,
} from "./lesson-messages";
import { insertInAppNotifications, resolveClassAudience } from "./lesson-delivery";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

const STAFF_ROLES = ["Administrador", "Secretaria", "Tesouraria", "Professor"];
const MANAGER_ROLES = ["Administrador", "Secretaria"];
const isMissingTable = (message?: string) =>
  /schema cache|does not exist|42P01|PGRST205/i.test(message ?? "");

export type LessonTask = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  dueOn: string | null;
};

export type LessonDetail = {
  slotId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  subjectName: string;
  className: string;
  room: string | null;
  teacher: { name: string | null; email: string | null; phone: string | null } | null;
  lessonType: string;
  deliveryMode: string;
  onlineUrl: string | null;
  topic: string | null;
  notes: string | null;
  tasks: LessonTask[];
  canEdit: boolean;
  /** As tabelas da migração ainda não existem: só se mostra o essencial. */
  detailsAvailable: boolean;
};

async function loadSlot(db: Db, schoolId: string, slotId: string) {
  const { data: slot } = await db
    .from("timetable_slots")
    .select("id, class_subject_id, weekday, starts_at, ends_at, room, room_id, status")
    .eq("school_id", schoolId)
    .eq("id", slotId)
    .maybeSingle();
  if (!slot) return null;
  const { data: cs } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id")
    .eq("school_id", schoolId)
    .eq("id", slot.class_subject_id)
    .maybeSingle();
  if (!cs) return null;
  return { slot, classSubject: cs };
}

async function ownTeacherId(db: Db, schoolId: string, userId: string) {
  const { data } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

/** Administrador/Secretaria sempre; Professor só na sua disciplina. */
async function assertCanManageClassSubject(
  db: Db,
  membership: { schoolId: string; appRole: string; allAppRoles?: string[] },
  userId: string,
  teacherId: string | null,
) {
  const roles = membership.allAppRoles ?? [membership.appRole];
  if (roles.some((r) => MANAGER_ROLES.includes(r))) return;
  const own = await ownTeacherId(db, membership.schoolId, userId);
  if (!own || own !== teacherId) {
    throw new Error("Só o professor desta disciplina (ou a direcção) pode alterar esta aula.");
  }
}

const slotInput = z.object({ slotId: z.string().uuid(), studentId: z.string().uuid().optional() });

export const getLessonDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => slotInput.parse(input))
  .handler(async ({ data, context }): Promise<LessonDetail> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    const roles: string[] = membership.allAppRoles ?? [membership.appRole];
    const isStaff = roles.some((r) => STAFF_ROLES.includes(r));
    const db = await loadSgaAdminClient();
    const loaded = await loadSlot(db, membership.schoolId, data.slotId);
    if (!loaded) throw new Error("Aula não encontrada.");
    const { slot, classSubject } = loaded;
    const schoolId = membership.schoolId;

    if (!isStaff) {
      // Aluno/encarregado: só aulas da turma da matrícula activa do aluno.
      const visible = await resolveVisibleStudent(context.userId, data.studentId);
      if (!visible) throw new Error("Aula não encontrada.");
      const { data: enrollment } = await visible.db
        .from("enrollments")
        .select("id")
        .eq("school_id", schoolId)
        .eq("student_id", visible.studentId)
        .eq("class_group_id", classSubject.class_group_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!enrollment) throw new Error("Aula não encontrada.");
    }

    const [subjectRes, groupRes, teacherRes, roomRes, detailRes, tasksRes, hidden] =
      await Promise.all([
        db.from("subjects").select("name").eq("id", classSubject.subject_id).maybeSingle(),
        db.from("class_groups").select("name").eq("id", classSubject.class_group_id).maybeSingle(),
        classSubject.teacher_id
          ? db
              .from("teachers")
              .select("id, person_id")
              .eq("id", classSubject.teacher_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        slot.room_id
          ? db.from("rooms").select("name").eq("id", slot.room_id).maybeSingle()
          : Promise.resolve({ data: null }),
        db
          .from("siga_timetable_slot_details")
          .select("lesson_type, delivery_mode, online_url, topic, notes")
          .eq("school_id", schoolId)
          .eq("timetable_slot_id", slot.id)
          .maybeSingle(),
        db
          .from("siga_class_tasks")
          .select("id, kind, title, description, due_on")
          .eq("school_id", schoolId)
          .eq("class_subject_id", classSubject.id)
          .eq("status", "published")
          .or(`due_on.is.null,due_on.gte.${todayInLuanda()}`)
          .order("due_on", { ascending: true, nullsFirst: false })
          .limit(10),
        loadHiddenTeachers(db, schoolId),
      ]);

    let teacher: LessonDetail["teacher"] = null;
    if (teacherRes.data?.person_id) {
      const { data: person } = await db
        .from("people")
        .select("full_name, email, phone")
        .eq("id", teacherRes.data.person_id)
        .maybeSingle();
      const hide = !isStaff && hidden.has(String(teacherRes.data.id));
      teacher = {
        name: person?.full_name ?? null,
        email: hide ? null : (person?.email ?? null),
        phone: hide ? null : (person?.phone ?? null),
      };
    }

    let canEdit = false;
    if (roles.some((r) => MANAGER_ROLES.includes(r))) canEdit = true;
    else if (roles.includes("Professor")) {
      canEdit = (await ownTeacherId(db, schoolId, context.userId)) === classSubject.teacher_id;
    }

    const detailsAvailable = !isMissingTable(detailRes.error?.message);
    const detail = detailRes.data;
    return {
      slotId: String(slot.id),
      weekday: Number(slot.weekday),
      startsAt: String(slot.starts_at ?? "").slice(0, 5),
      endsAt: String(slot.ends_at ?? "").slice(0, 5),
      subjectName: subjectRes.data?.name ? String(subjectRes.data.name) : "Disciplina",
      className: groupRes.data?.name ? String(groupRes.data.name) : "Turma",
      room: roomRes.data?.name ? String(roomRes.data.name) : (slot.room ?? null),
      teacher,
      lessonType: detail?.lesson_type ?? "teorica",
      deliveryMode: detail?.delivery_mode ?? "presencial",
      onlineUrl: detail?.online_url ?? null,
      topic: detail?.topic ?? null,
      notes: detail?.notes ?? null,
      tasks: tasksRes.error
        ? []
        : (tasksRes.data ?? []).map((t) => ({
            id: String(t.id),
            kind: String(t.kind),
            title: String(t.title),
            description: t.description ? String(t.description) : null,
            dueOn: t.due_on ? String(t.due_on) : null,
          })),
      canEdit,
      detailsAvailable,
    };
  });

const saveDetailInput = z.object({
  slotId: z.string().uuid(),
  lessonType: z.enum(LESSON_TYPES),
  deliveryMode: z.enum(DELIVERY_MODES),
  onlineUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^https:\/\//i, "A ligação tem de começar por https://")
    .optional()
    .or(z.literal("")),
  topic: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const saveLessonDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveDetailInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    const loaded = await loadSlot(db, membership.schoolId, data.slotId);
    if (!loaded) throw new Error("Aula não encontrada.");
    await assertCanManageClassSubject(
      db,
      membership,
      context.userId,
      loaded.classSubject.teacher_id,
    );
    if (data.deliveryMode !== "presencial" && !data.onlineUrl) {
      throw new Error("Indique a ligação da aula online (https://…).");
    }
    const { error } = await db.from("siga_timetable_slot_details").upsert(
      {
        school_id: membership.schoolId,
        timetable_slot_id: data.slotId,
        lesson_type: data.lessonType,
        delivery_mode: data.deliveryMode,
        online_url: data.deliveryMode === "presencial" ? null : data.onlineUrl || null,
        topic: data.topic || null,
        notes: data.notes || null,
        created_by: context.userId,
        updated_by: context.userId,
      },
      { onConflict: "timetable_slot_id" },
    );
    if (error) {
      if (isMissingTable(error.message)) {
        throw new Error("Os detalhes das aulas ainda não estão activos: falta aplicar a migração.");
      }
      throw publicDatabaseError(error, "Não foi possível guardar os detalhes da aula.");
    }
    return { ok: true };
  });

const createTaskInput = z.object({
  slotId: z.string().uuid(),
  kind: z.enum(TASK_KINDS),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  notifyStudents: z.boolean().default(true),
});

export const createClassTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    const loaded = await loadSlot(db, membership.schoolId, data.slotId);
    if (!loaded) throw new Error("Aula não encontrada.");
    const { classSubject } = loaded;
    await assertCanManageClassSubject(db, membership, context.userId, classSubject.teacher_id);
    const { data: task, error } = await db
      .from("siga_class_tasks")
      .insert({
        school_id: membership.schoolId,
        class_subject_id: classSubject.id,
        timetable_slot_id: data.slotId,
        kind: data.kind,
        title: data.title,
        description: data.description || null,
        due_on: data.dueOn || null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (isMissingTable(error.message)) {
        throw new Error("As tarefas ainda não estão activas: falta aplicar a migração.");
      }
      throw publicDatabaseError(error, "Não foi possível criar a tarefa.");
    }

    let notified = 0;
    if (data.notifyStudents) {
      const { data: subject } = await db
        .from("subjects")
        .select("name")
        .eq("id", classSubject.subject_id)
        .maybeSingle();
      const audience = await resolveClassAudience(
        db,
        membership.schoolId,
        [classSubject.class_group_id],
        {
          teachers: false,
          students: true,
          guardians: false,
        },
      );
      const due = data.dueOn ? ` Entrega: ${data.dueOn.split("-").reverse().join("/")}.` : "";
      notified = await insertInAppNotifications(
        db,
        membership.schoolId,
        audience
          .filter((r) => r.userId)
          .map((r) => ({
            userId: r.userId!,
            eventType: "academic.task.created",
            title: `Nova tarefa de ${subject?.name ?? "disciplina"}`,
            body: `${data.title}.${due}`,
            payload: { taskId: task.id, slotId: data.slotId },
          })),
      ).catch(() => 0);
    }
    return { id: String(task.id), notified };
  });

export const archiveClassTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria", "Professor"],
    );
    const db = await loadSgaAdminClient();
    const { data: task } = await db
      .from("siga_class_tasks")
      .select("id, class_subject_id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task) throw new Error("Tarefa não encontrada.");
    const { data: cs } = await db
      .from("class_subjects")
      .select("teacher_id")
      .eq("id", task.class_subject_id)
      .maybeSingle();
    await assertCanManageClassSubject(db, membership, context.userId, cs?.teacher_id ?? null);
    const { error } = await db
      .from("siga_class_tasks")
      .update({ status: "archived", updated_by: context.userId })
      .eq("id", data.taskId);
    if (error) throw publicDatabaseError(error, "Não foi possível arquivar a tarefa.");
    return { ok: true };
  });

/** Horário semanal do próprio professor: todas as suas turmas. */
export const getMyTeacherTimetable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentTimetable> => {
    const empty: StudentTimetable = { className: null, publishedAt: null, days: [] };
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return empty;
    const db = await loadSgaAdminClient();
    const teacherId = await ownTeacherId(db, membership.schoolId, context.userId);
    if (!teacherId) return empty;
    const { data: classSubjects } = await db
      .from("class_subjects")
      .select("id, class_group_id, subject_id")
      .eq("school_id", membership.schoolId)
      .eq("teacher_id", teacherId)
      .eq("status", "active");
    const csIds = (classSubjects ?? []).map((cs) => String(cs.id));
    if (!csIds.length) return empty;
    const [{ data: slots }, { data: subjects }, { data: groups }] = await Promise.all([
      db
        .from("timetable_slots")
        .select("id, class_subject_id, weekday, starts_at, ends_at, room, room_id")
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .in("class_subject_id", csIds),
      db
        .from("subjects")
        .select("id, name")
        .in("id", [...new Set((classSubjects ?? []).map((cs) => String(cs.subject_id)))]),
      db
        .from("class_groups")
        .select("id, name")
        .in("id", [...new Set((classSubjects ?? []).map((cs) => String(cs.class_group_id)))]),
    ]);
    const roomIds = [
      ...new Set(
        (slots ?? [])
          .map((s) => s.room_id)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const { data: rooms } = roomIds.length
      ? await db.from("rooms").select("id, name").in("id", roomIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const subjectName = new Map((subjects ?? []).map((s) => [String(s.id), String(s.name)]));
    const groupName = new Map((groups ?? []).map((g) => [String(g.id), String(g.name)]));
    const roomName = new Map((rooms ?? []).map((r) => [String(r.id), String(r.name)]));
    const csById = new Map((classSubjects ?? []).map((cs) => [String(cs.id), cs]));
    const lessons = (slots ?? []).map((slot) => {
      const cs = csById.get(String(slot.class_subject_id));
      return {
        weekday: Number(slot.weekday),
        slotId: String(slot.id),
        startsAt: String(slot.starts_at ?? "").slice(0, 5),
        endsAt: String(slot.ends_at ?? "").slice(0, 5),
        subjectName: subjectName.get(String(cs?.subject_id)) ?? "Disciplina",
        teacherName: null,
        className: groupName.get(String(cs?.class_group_id)) ?? null,
        room: (slot.room_id ? roomName.get(String(slot.room_id)) : null) ?? slot.room ?? null,
      };
    });
    return { className: null, publishedAt: null, days: groupTimetableByDay(lessons) };
  });

function mapSettings(row: Record<string, unknown> | null): ReminderSettings {
  if (!row) return { ...DEFAULT_REMINDER_SETTINGS };
  return {
    enabled: Boolean(row["enabled"]),
    sendHour: Number(row["send_hour"] ?? 18),
    notifyTeachers: Boolean(row["notify_teachers"]),
    notifyStudents: Boolean(row["notify_students"]),
    notifyGuardians: Boolean(row["notify_guardians"]),
    channelInApp: Boolean(row["channel_in_app"]),
    channelEmail: Boolean(row["channel_email"]),
    channelSms: Boolean(row["channel_sms"]),
    notifyOnPublish: Boolean(row["notify_on_publish"]),
  };
}

export async function loadReminderSettings(db: Db, schoolId: string) {
  const { data, error } = await db
    .from("siga_lesson_reminder_settings")
    .select("*")
    .eq("school_id", schoolId)
    .maybeSingle();
  return { settings: mapSettings(data), available: !isMissingTable(error?.message) };
}

export const getLessonReminderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    return loadReminderSettings(db, membership.schoolId);
  });

const settingsInput = z.object({
  enabled: z.boolean(),
  sendHour: z.number().int().min(0).max(23),
  notifyTeachers: z.boolean(),
  notifyStudents: z.boolean(),
  notifyGuardians: z.boolean(),
  channelInApp: z.boolean(),
  channelEmail: z.boolean(),
  channelSms: z.boolean(),
  notifyOnPublish: z.boolean(),
});

export const saveLessonReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => settingsInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();
    const { error } = await db.from("siga_lesson_reminder_settings").upsert(
      {
        school_id: membership.schoolId,
        enabled: data.enabled,
        send_hour: data.sendHour,
        notify_teachers: data.notifyTeachers,
        notify_students: data.notifyStudents,
        notify_guardians: data.notifyGuardians,
        channel_in_app: data.channelInApp,
        channel_email: data.channelEmail,
        channel_sms: data.channelSms,
        notify_on_publish: data.notifyOnPublish,
        updated_by: context.userId,
      },
      { onConflict: "school_id" },
    );
    if (error) {
      if (isMissingTable(error.message)) {
        throw new Error("Os lembretes ainda não estão activos: falta aplicar a migração.");
      }
      throw publicDatabaseError(error, "Não foi possível guardar a configuração.");
    }
    return { ok: true };
  });

/**
 * Depois de publicar o horário de uma turma: aviso na aplicação aos
 * professores das disciplinas e aos alunos (e encarregados, se configurado).
 * Nunca falha a publicação — devolve quantos avisos gravou.
 */
export async function notifySchedulePublished(
  db: Db,
  input: { schoolId: string; classGroupId: string; validFrom?: string | null; scheduleId: string },
) {
  try {
    const { settings } = await loadReminderSettings(db, input.schoolId);
    if (!settings.notifyOnPublish) return 0;
    const [{ data: group }, { data: cs }] = await Promise.all([
      db.from("class_groups").select("name").eq("id", input.classGroupId).maybeSingle(),
      db
        .from("class_subjects")
        .select("id")
        .eq("school_id", input.schoolId)
        .eq("class_group_id", input.classGroupId),
    ]);
    const csIds = (cs ?? []).map((row) => String(row.id));
    const { count } = csIds.length
      ? await db
          .from("timetable_slots")
          .select("id", { count: "exact", head: true })
          .eq("school_id", input.schoolId)
          .eq("status", "active")
          .in("class_subject_id", csIds)
      : { count: 0 };
    const audience = await resolveClassAudience(db, input.schoolId, [input.classGroupId], {
      teachers: true,
      students: true,
      guardians: settings.notifyGuardians,
    });
    const className = group?.name ? String(group.name) : "turma";
    const seen = new Set<string>();
    const rows = audience
      .filter(
        (r) => r.userId && !seen.has(`${r.userId}:${r.role}`) && seen.add(`${r.userId}:${r.role}`),
      )
      .map((r) => {
        const message = buildPublishedMessage({
          className,
          audience: r.role,
          validFrom: input.validFrom ?? null,
          lessonsPerWeek: count ?? 0,
        });
        return {
          userId: r.userId!,
          eventType: "academic.schedule.published",
          title: message.title,
          body: message.body,
          payload: { scheduleId: input.scheduleId, classGroupId: input.classGroupId },
        };
      });
    return await insertInAppNotifications(db, input.schoolId, rows);
  } catch (error) {
    console.warn("[schedule.published] avisos não enviados:", error);
    return 0;
  }
}
