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
import {
  type SupabaseAuthContext,
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import { addDaysIso, todayInLuanda } from "@/features/calendar/dates";
import { loadAcademicAgendaForRequest } from "@/features/calendar/agenda-server";
import {
  academicAgendaWeek,
  studentUpcomingFromAcademicAgenda,
  timetableFromAcademicAgenda,
} from "@/features/calendar/portal-agenda";
export { groupTimetableByDay } from "@/features/calendar/portal-agenda";

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
  /** Avaliações autorizadas dos próximos 93 dias (até 8), para o calendário. */
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
      .filter((slot) => (slot.weekday === 7 ? 0 : slot.weekday) === weekday)
      .filter((slot) => daysAhead > 0 || slot.endsAt.slice(0, 5) > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (candidates[0]) return { ...candidates[0], weekday, daysAhead };
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

const agendaInputSchema = z.object({ studentId: z.string().guid().optional() });
/** Segunda-feira (ou qualquer dia) da semana a mostrar; sem ela, a semana corrente. */
export const timetableWeekSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Data inválida.")
  .optional();
const timetableInputSchema = agendaInputSchema.extend({ weekStart: timetableWeekSchema });
type PortalContext = Pick<SupabaseAuthContext, "supabase" | "userId">;

/** A pré-matrícula do próximo ano não substitui a turma em curso no cabeçalho. */
async function resolveStudentEnrollment(
  userId: string,
  today: string,
  requestedStudentId?: string,
) {
  const visible = await resolveVisibleStudent(userId, requestedStudentId);
  if (!visible) return null;
  const { db, schoolId, studentId } = visible;
  const { data: enrollment, error } = await db
    .from("enrollments")
    .select("class_group_id, final_average")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .lte("enrolled_on", today)
    .or(`ended_on.is.null,ended_on.gte.${today}`)
    .order("enrolled_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar a matrícula.");
  const classGroupId = enrollment?.class_group_id ?? null;
  let className: string | null = null;
  if (classGroupId) {
    const group = await db
      .from("class_groups")
      .select("name")
      .eq("school_id", schoolId)
      .eq("id", classGroupId)
      .maybeSingle();
    if (group.error) throw publicDatabaseError(group.error, "Não foi possível carregar a turma.");
    className = group.data?.name ?? null;
  }
  const average =
    enrollment?.final_average != null && Number.isFinite(Number(enrollment.final_average))
      ? Number(enrollment.final_average)
      : null;
  return { studentId, className, average };
}

export type StudentUpcomingAssessment = {
  name: string;
  subjectName: string;
  date: string;
  kind: string | null;
};

/** Próximos 93 dias reais; não inventa aulas na semana seguinte de férias. */
export async function loadStudentAgendaForRequest(
  input: { studentId?: string },
  context: PortalContext,
): Promise<StudentAgenda> {
  const today = todayInLuanda();
  const resolved = await resolveStudentEnrollment(context.userId, today, input.studentId);
  if (!resolved) return EMPTY;
  const events = await loadAcademicAgendaForRequest(
    { start: today, end: addDaysIso(today, 93), studentId: resolved.studentId },
    context,
  );
  return {
    className: resolved.className,
    average: resolved.average,
    ...studentUpcomingFromAcademicAgenda(events, today, nowInLuandaHhMm()),
  };
}

export const getMyStudentAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => agendaInputSchema.parse(input ?? {}))
  .handler(({ data, context }) => loadStudentAgendaForRequest(data, context));

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
  /** Segunda-feira da semana mostrada (AAAA-MM-DD). */
  weekStart?: string;
  /** weekday como Date.getDay (0 = domingo … 6 = sábado), só dias com aulas. */
  days: Array<{ weekday: number; lessons: StudentTimetableLesson[] }>;
};

/** Semana pedida (ou a corrente), incluindo apenas as cadeiras e datas autorizadas. */
export async function loadStudentTimetableForRequest(
  input: { studentId?: string; weekStart?: string },
  context: PortalContext,
): Promise<StudentTimetable> {
  const today = todayInLuanda();
  const resolved = await resolveStudentEnrollment(context.userId, today, input.studentId);
  if (!resolved) return { className: null, publishedAt: null, days: [] };
  // A turma é a de hoje; só a semana mostrada muda.
  const week = academicAgendaWeek(input.weekStart ?? today);
  const events = await loadAcademicAgendaForRequest(
    { ...week, studentId: resolved.studentId },
    context,
  );
  return timetableFromAcademicAgenda(events, week, resolved.className);
}

export const getMyStudentTimetable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => timetableInputSchema.parse(input ?? {}))
  .handler(({ data, context }) => loadStudentTimetableForRequest(data, context));
