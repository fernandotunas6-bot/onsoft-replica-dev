/**
 * Agenda do próprio aluno para o painel inicial: turma, média, próxima aula e
 * próxima avaliação. Antes o painel mostrava valores fixos ("Matemática",
 * "Física · Prova", média 14.7) a todos os alunos.
 *
 * Só o Aluno (a sua matrícula activa) e o Encarregado (a dos educandos
 * ligados à conta) recebem dados.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import { todayInLuanda } from "@/features/calendar/dates";
import { weekdayJsFromIso } from "@/features/dashboard/school-today";

export type StudentAgendaSlot = {
  weekday: number;
  startsAt: string;
  endsAt: string;
  subjectName: string;
};

export type StudentAgenda = {
  className: string | null;
  average: number | null;
  nextLesson: (StudentAgendaSlot & { daysAhead: number }) | null;
  nextAssessment: { name: string; subjectName: string; date: string; kind: string | null } | null;
  /** Avaliações marcadas da turma a partir de hoje (até 8), para o calendário. */
  upcomingAssessments: Array<{
    name: string;
    subjectName: string;
    date: string;
    kind: string | null;
  }>;
};

const EMPTY: StudentAgenda = {
  className: null,
  average: null,
  nextLesson: null,
  nextAssessment: null,
  upcomingAssessments: [],
};

/**
 * Próxima aula a partir de agora: primeiro as que ainda não terminaram hoje,
 * depois os dias seguintes da semana (weekday como Date.getDay, 0 = domingo).
 */
export function pickNextLesson(
  slots: StudentAgendaSlot[],
  todayWeekday: number,
  nowHhMm: string,
): (StudentAgendaSlot & { daysAhead: number }) | null {
  const now = nowHhMm.slice(0, 5);
  for (let daysAhead = 0; daysAhead < 7; daysAhead += 1) {
    const weekday = (todayWeekday + daysAhead) % 7;
    const candidates = slots
      .filter((slot) => slot.weekday === weekday)
      .filter((slot) => daysAhead > 0 || slot.endsAt.slice(0, 5) > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (candidates[0]) return { ...candidates[0], daysAhead };
  }
  return null;
}

function nowInLuandaHhMm(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

const agendaInputSchema = z.object({ studentId: z.string().uuid().optional() });

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * Matrícula activa do aluno que esta conta pode ver: o Aluno a própria, o
 * Encarregado a de um educando ligado. Qualquer outro caso devolve null.
 */
async function resolveStudentEnrollment(userId: string, requestedStudentId?: string) {
  const visible = await resolveVisibleStudent(userId, requestedStudentId);
  if (!visible) return null;
  const { db, schoolId, studentId } = visible;

  const { data: enrollment } = await db
    .from("enrollments")
    .select("class_group_id, final_average")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const classGroupId = enrollment?.class_group_id ? String(enrollment.class_group_id) : null;
  const average =
    enrollment?.final_average != null && Number.isFinite(Number(enrollment.final_average))
      ? Number(enrollment.final_average)
      : null;
  return { db, schoolId, classGroupId, average };
}

type ClassSubjectRow = { id: string; subject_id: string | null; teacher_id: string | null };

async function loadClassSubjects(db: AdminDb, schoolId: string, classGroupId: string) {
  const { data } = await db
    .from("class_subjects")
    .select("id, subject_id, teacher_id")
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId);
  return (data ?? []) as ClassSubjectRow[];
}

async function loadSubjectNames(db: AdminDb, schoolId: string, subjectIds: string[]) {
  if (!subjectIds.length) return new Map<string, string>();
  const { data } = await db
    .from("subjects")
    .select("id, name")
    .eq("school_id", schoolId)
    .in("id", subjectIds);
  return new Map((data ?? []).map((row) => [String(row.id), String(row.name)]));
}

type SlotRow = {
  id: string;
  class_subject_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room: string | null;
  room_id: string | null;
};

async function loadActiveSlots(db: AdminDb, schoolId: string, classSubjectIds: string[]) {
  if (!classSubjectIds.length) return [] as SlotRow[];
  const { data } = await db
    .from("timetable_slots")
    .select("id, class_subject_id, weekday, starts_at, ends_at, room, room_id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .in("class_subject_id", classSubjectIds);
  return (data ?? []) as SlotRow[];
}

const uniq = (values: Array<string | null | undefined>) => [
  ...new Set(values.filter(Boolean).map(String)),
];

export type StudentUpcomingAssessment = {
  name: string;
  subjectName: string;
  date: string;
  kind: string | null;
};

export const getMyStudentAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => agendaInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<StudentAgenda> => {
    const resolved = await resolveStudentEnrollment(context.userId, data.studentId);
    if (!resolved) return EMPTY;
    const { db, schoolId, classGroupId, average } = resolved;
    if (!classGroupId) return { ...EMPTY, average };

    const today = todayInLuanda();
    const [groupRes, classSubjects, assessmentsRes] = await Promise.all([
      db
        .from("class_groups")
        .select("name")
        .eq("school_id", schoolId)
        .eq("id", classGroupId)
        .maybeSingle(),
      loadClassSubjects(db, schoolId, classGroupId),
      db
        .from("siga_assessment_items")
        .select("name, kind, subject_id, assessed_on")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .gte("assessed_on", today)
        .order("assessed_on", { ascending: true })
        .limit(8),
    ]);
    const assessments = assessmentsRes.error ? [] : (assessmentsRes.data ?? []);

    const [subjectName, slotRows] = await Promise.all([
      loadSubjectNames(
        db,
        schoolId,
        uniq([
          ...classSubjects.map((row) => row.subject_id),
          ...assessments.map((a) => a.subject_id),
        ]),
      ),
      loadActiveSlots(
        db,
        schoolId,
        classSubjects.map((row) => String(row.id)),
      ),
    ]);
    const subjectOfClassSubject = new Map(
      classSubjects.map((row) => [String(row.id), String(row.subject_id ?? "")]),
    );
    const slots: StudentAgendaSlot[] = slotRows.map((slot) => ({
      weekday: Number(slot.weekday),
      startsAt: String(slot.starts_at ?? ""),
      endsAt: String(slot.ends_at ?? ""),
      subjectName:
        subjectName.get(subjectOfClassSubject.get(String(slot.class_subject_id)) ?? "") ??
        "Disciplina",
    }));

    const upcomingAssessments: StudentUpcomingAssessment[] = assessments.map((item) => ({
      name: String(item.name ?? "Avaliação"),
      kind: item.kind ? String(item.kind) : null,
      subjectName: subjectName.get(String(item.subject_id ?? "")) ?? "Disciplina",
      date: String(item.assessed_on),
    }));

    return {
      className: groupRes.data?.name ? String(groupRes.data.name) : null,
      average,
      nextLesson: pickNextLesson(slots, weekdayJsFromIso(today), nowInLuandaHhMm()),
      nextAssessment: upcomingAssessments[0] ?? null,
      upcomingAssessments,
    };
  });

export type StudentTimetableLesson = {
  /** Bloco do horário: abre os detalhes da aula. */
  slotId?: string;
  /** Turma (horário do professor, que junta várias). */
  className?: string | null;
  startsAt: string;
  endsAt: string;
  subjectName: string;
  teacherName: string | null;
  room: string | null;
};

export type StudentTimetable = {
  className: string | null;
  publishedAt: string | null;
  /** weekday como Date.getDay (1 = segunda … 6 = sábado), só dias com aulas. */
  days: Array<{ weekday: number; lessons: StudentTimetableLesson[] }>;
};

/** Agrupa por dia (segunda primeiro) e ordena por hora de início. */
export function groupTimetableByDay(
  lessons: Array<StudentTimetableLesson & { weekday: number }>,
): StudentTimetable["days"] {
  const byDay = new Map<number, StudentTimetableLesson[]>();
  for (const { weekday, ...lesson } of lessons) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    byDay.set(weekday, [...(byDay.get(weekday) ?? []), lesson]);
  }
  const order = (weekday: number) => (weekday === 0 ? 7 : weekday);
  return [...byDay.entries()]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([weekday, dayLessons]) => ({
      weekday,
      lessons: dayLessons.sort(
        (a, b) =>
          a.startsAt.localeCompare(b.startsAt) || a.subjectName.localeCompare(b.subjectName, "pt"),
      ),
    }));
}

const EMPTY_TIMETABLE: StudentTimetable = { className: null, publishedAt: null, days: [] };

/** Horário semanal da turma do aluno (ou do educando), com professor e sala. */
export const getMyStudentTimetable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => agendaInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<StudentTimetable> => {
    const resolved = await resolveStudentEnrollment(context.userId, data.studentId);
    if (!resolved?.classGroupId) return EMPTY_TIMETABLE;
    const { db, schoolId, classGroupId } = resolved;

    const [groupRes, classSubjects, scheduleRes] = await Promise.all([
      db
        .from("class_groups")
        .select("name")
        .eq("school_id", schoolId)
        .eq("id", classGroupId)
        .maybeSingle(),
      loadClassSubjects(db, schoolId, classGroupId),
      db
        .from("academic_schedules")
        .select("published_at")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .eq("status", "published")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const slotRows = await loadActiveSlots(
      db,
      schoolId,
      classSubjects.map((row) => String(row.id)),
    );
    const className = groupRes.data?.name ? String(groupRes.data.name) : null;
    const publishedAt =
      !scheduleRes.error && scheduleRes.data?.published_at
        ? String(scheduleRes.data.published_at)
        : null;
    if (!slotRows.length) return { className, publishedAt, days: [] };

    const teacherIds = uniq(classSubjects.map((row) => row.teacher_id));
    const roomIds = uniq(slotRows.map((slot) => slot.room_id));
    const [subjectName, teachersRes, roomsRes] = await Promise.all([
      loadSubjectNames(db, schoolId, uniq(classSubjects.map((row) => row.subject_id))),
      teacherIds.length
        ? db.from("teachers").select("id, person_id").eq("school_id", schoolId).in("id", teacherIds)
        : Promise.resolve({ data: [] as Array<{ id: string; person_id: string | null }> }),
      roomIds.length
        ? db.from("rooms").select("id, name").eq("school_id", schoolId).in("id", roomIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const teacherPerson = new Map(
      (teachersRes.data ?? []).map((row) => [String(row.id), String(row.person_id ?? "")]),
    );
    const { loadPeopleLite } = await import("@/features/people/lookup");
    const people = await loadPeopleLite(db, schoolId, uniq([...teacherPerson.values()]));
    const roomName = new Map(
      (roomsRes.data ?? []).map((row) => [String(row.id), String(row.name)]),
    );
    const classSubjectById = new Map(classSubjects.map((row) => [String(row.id), row]));

    const lessons = slotRows.map((slot) => {
      const cs = classSubjectById.get(String(slot.class_subject_id));
      const personId = cs?.teacher_id ? teacherPerson.get(String(cs.teacher_id)) : undefined;
      return {
        weekday: Number(slot.weekday),
        slotId: String(slot.id),
        startsAt: String(slot.starts_at ?? "").slice(0, 5),
        endsAt: String(slot.ends_at ?? "").slice(0, 5),
        subjectName: subjectName.get(String(cs?.subject_id ?? "")) ?? "Disciplina",
        teacherName: personId ? (people.get(personId)?.full_name ?? null) : null,
        room: (slot.room_id ? roomName.get(String(slot.room_id)) : null) ?? slot.room ?? null,
      };
    });
    return { className, publishedAt, days: groupTimetableByDay(lessons) };
  });
