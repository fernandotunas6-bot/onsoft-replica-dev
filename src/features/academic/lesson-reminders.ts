/**
 * Lembrete da véspera: às escolas cuja hora configurada é a hora actual de
 * Luanda, envia a cada professor, aluno (e encarregado, se activo) a lista das
 * aulas de amanhã, pelos canais escolhidos. Idempotente por dia e canal
 * (siga_lesson_reminder_log), por isso pode correr de hora a hora sem repetir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDays,
  buildReminderMessage,
  isReminderHour,
  luandaNow,
  reminderChannels,
  weekdayOf,
  type LessonLine,
} from "./lesson-messages";
import {
  insertInAppNotifications,
  resolveClassAudience,
  sendLessonEmail,
  sendLessonSms,
  type Recipient,
} from "./lesson-delivery";
import { loadReminderSettings } from "./timetable-lessons";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export type ReminderRunSummary = {
  date: string;
  schools: number;
  sent: number;
  skipped: number;
  failed: number;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

async function tomorrowLessonsByClass(db: Db, schoolId: string, weekday: number) {
  const { data: slots } = await db
    .from("timetable_slots")
    .select("id, class_subject_id, starts_at, ends_at, room")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .eq("weekday", weekday);
  if (!slots?.length) return new Map<string, Array<LessonLine & { teacherId: string | null }>>();
  const csIds = [...new Set(slots.map((s) => str(s.class_subject_id)))];
  const { data: cs } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id")
    .in("id", csIds);
  const subjectIds = [...new Set((cs ?? []).map((c) => str(c.subject_id)))];
  const groupIds = [...new Set((cs ?? []).map((c) => str(c.class_group_id)))];
  const slotIds = slots.map((s) => str(s.id));
  const [{ data: subjects }, { data: groups }, details] = await Promise.all([
    db.from("subjects").select("id, name").in("id", subjectIds),
    db.from("class_groups").select("id, name").in("id", groupIds),
    db
      .from("siga_timetable_slot_details")
      .select("timetable_slot_id, delivery_mode")
      .in("timetable_slot_id", slotIds),
  ]);
  const subjectName = new Map((subjects ?? []).map((s: Row) => [str(s.id), str(s.name)]));
  const groupName = new Map((groups ?? []).map((g: Row) => [str(g.id), str(g.name)]));
  const modeBySlot = new Map(
    ((details.error ? [] : details.data) ?? []).map((d: Row) => [
      str(d.timetable_slot_id),
      str(d.delivery_mode),
    ]),
  );
  const csById = new Map((cs ?? []).map((c: Row) => [str(c.id), c]));
  const byClass = new Map<string, Array<LessonLine & { teacherId: string | null }>>();
  for (const slot of slots) {
    const c = csById.get(str(slot.class_subject_id));
    if (!c) continue;
    const classGroupId = str(c.class_group_id);
    const list = byClass.get(classGroupId) ?? [];
    list.push({
      startsAt: str(slot.starts_at),
      endsAt: str(slot.ends_at),
      subjectName: subjectName.get(str(c.subject_id)) || "Disciplina",
      className: groupName.get(classGroupId) || null,
      room: slot.room ? str(slot.room) : null,
      deliveryMode: modeBySlot.get(str(slot.id)) ?? null,
      teacherId: c.teacher_id ? str(c.teacher_id) : null,
    });
    byClass.set(classGroupId, list);
  }
  return byClass;
}

export async function runLessonReminders(
  db: Db,
  options: { now?: Date; schoolId?: string; force?: boolean } = {},
): Promise<ReminderRunSummary> {
  const { date: today, hour } = luandaNow(options.now);
  const date = addDays(today, 1);
  const weekday = weekdayOf(date);
  const summary: ReminderRunSummary = { date, schools: 0, sent: 0, skipped: 0, failed: 0 };

  let query = db.from("siga_lesson_reminder_settings").select("school_id").eq("enabled", true);
  if (options.schoolId) query = query.eq("school_id", options.schoolId);
  const { data: enabledSchools, error } = await query;
  if (error) return summary; // tabela ainda por aplicar: nada a fazer

  for (const row of enabledSchools ?? []) {
    const schoolId = str(row.school_id);
    const { settings } = await loadReminderSettings(db, schoolId);
    if (!options.force && !isReminderHour(settings, hour)) continue;
    const channels = reminderChannels(settings);
    if (!channels.length) continue;
    summary.schools += 1;

    // Prazo de lançamento das notas (7, 3 e 1 dia antes do fim do período).
    if (settings.notifyTeachers && settings.channelInApp) {
      const { remindGradeDeadlines } = await import("./assessment-notify");
      summary.sent += await remindGradeDeadlines(db, schoolId, today).catch(() => 0);
    }

    const byClass = await tomorrowLessonsByClass(db, schoolId, weekday);
    if (!byClass.size) continue;
    const { data: school } = await db
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .maybeSingle();

    const audience = await resolveClassAudience(db, schoolId, [...byClass.keys()], {
      teachers: settings.notifyTeachers,
      students: settings.notifyStudents,
      guardians: settings.notifyGuardians,
    });
    // Professores: só as suas aulas, de todas as turmas, numa mensagem.
    const { data: teacherRows } = settings.notifyTeachers
      ? await db.from("teachers").select("id, user_id").eq("school_id", schoolId)
      : { data: [] };
    const teacherIdByUser = new Map(
      (teacherRows ?? []).map((t: Row) => [str(t.user_id), str(t.id)]),
    );

    // Um destinatário (utilizador ou contacto) pode aparecer em várias turmas:
    // junta-se tudo numa só mensagem por pessoa e papel.
    const grouped = new Map<string, { recipient: Recipient; lessons: LessonLine[] }>();
    for (const recipient of audience) {
      const key = `${recipient.userId ?? recipient.email ?? recipient.phone}:${recipient.role}`;
      const classLessons = byClass.get(recipient.classGroupId) ?? [];
      const lessons =
        recipient.role === "teacher"
          ? classLessons.filter((l) => l.teacherId === teacherIdByUser.get(str(recipient.userId)))
          : classLessons;
      if (!lessons.length) continue;
      const entry = grouped.get(key) ?? { recipient, lessons: [] };
      // Encarregado com vários educandos: uma mensagem, sem nome específico.
      if (entry.recipient.studentName !== recipient.studentName) {
        entry.recipient = { ...entry.recipient, studentName: null };
      }
      entry.lessons.push(...lessons.filter((l) => !entry.lessons.includes(l)));
      grouped.set(key, entry);
    }

    for (const { recipient, lessons } of grouped.values()) {
      const message = buildReminderMessage({
        lessons,
        date,
        audience: recipient.role,
        studentName: recipient.studentName ?? null,
      });
      for (const channel of channels) {
        const target =
          channel === "in_app"
            ? recipient.userId
            : channel === "email"
              ? recipient.email
              : recipient.phone;
        if (!target || !recipient.userId) {
          summary.skipped += 1;
          continue;
        }
        // Reserva o envio; se já existir (mesmo dia/canal), outro corre já o fez.
        const { error: claimError } = await db.from("siga_lesson_reminder_log").insert({
          school_id: schoolId,
          user_id: recipient.userId,
          lesson_date: date,
          channel,
          lessons_count: lessons.length,
          status: "sent",
        });
        if (claimError) {
          summary.skipped += 1;
          continue;
        }
        let result: { ok: boolean; error?: string } = { ok: true };
        if (channel === "in_app") {
          result = await insertInAppNotifications(db, schoolId, [
            {
              userId: recipient.userId,
              eventType: "academic.lesson.reminder",
              title: message.title,
              body: message.body,
              payload: { date },
            },
          ])
            .then(() => ({ ok: true }))
            .catch((e: Error) => ({ ok: false, error: e.message }));
        } else if (channel === "email") {
          result = await sendLessonEmail({
            to: target,
            ...message,
            schoolName: school?.name ?? null,
          });
        } else {
          result = await sendLessonSms({ to: target, ...message });
        }
        if (result.ok) summary.sent += 1;
        else {
          summary.failed += 1;
          await db
            .from("siga_lesson_reminder_log")
            .update({ status: "failed", error: (result.error ?? "").slice(0, 300) })
            .eq("school_id", schoolId)
            .eq("user_id", recipient.userId)
            .eq("lesson_date", date)
            .eq("channel", channel);
        }
      }
    }
  }
  return summary;
}
