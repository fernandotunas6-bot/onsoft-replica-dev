import { todayInLuanda } from "@/features/calendar/dates";
import { nowTimeInLuanda } from "@/features/dashboard/school-today";
import {
  teacherPresenceState,
  type TeacherPresenceFields,
  type TeacherPresenceState,
} from "@/features/pedagogica/teacher-presence";

export type LessonPresenceSession = {
  id: string;
  lesson_date: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  teacher_presence?: TeacherPresenceFields | null;
};

export function lessonPresenceState(
  session: LessonPresenceSession,
  now: { today: string; nowTime: string } = {
    today: todayInLuanda(),
    nowTime: nowTimeInLuanda(),
  },
): TeacherPresenceState {
  return teacherPresenceState({
    lessonDate: session.lesson_date,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    sessionStatus: session.status,
    checkedInAt: session.teacher_presence?.teacher_checked_in_at,
    lateMinutes: session.teacher_presence?.teacher_late_minutes,
    today: now.today,
    nowTime: now.nowTime,
  });
}

/** Contagem do dia para a Direcção: quantas aulas com professor confirmado, atrasado ou em falta. */
export function summarizeTeacherPresence(sessions: LessonPresenceSession[]) {
  const counts: Record<TeacherPresenceState, number> = {
    confirmed: 0,
    late: 0,
    call_only: 0,
    awaiting: 0,
    missing: 0,
    upcoming: 0,
    cancelled: 0,
  };
  for (const session of sessions) counts[lessonPresenceState(session)] += 1;
  return counts;
}
