import type {
  StudentAgenda,
  StudentTimetable,
  StudentTimetableLesson,
} from "@/features/dashboard/student-agenda";
import type { AgendaEvent } from "./agenda";
import { addDaysIso, weekdayMonday0 } from "./dates";

/** Semana civil de Luanda, segunda-feira inclusiva a segunda-feira exclusiva. */
export function academicAgendaWeek(today: string) {
  const start = addDaysIso(today, -weekdayMonday0(today));
  return { start, end: addDaysIso(start, 7) };
}

/** O contrato dos portais usa domingo=0; a base usa domingo=7. */
export function groupTimetableByDay(
  lessons: Array<StudentTimetableLesson & { weekday: number }>,
): StudentTimetable["days"] {
  const byDay = new Map<number, StudentTimetableLesson[]>();
  for (const { weekday: storedWeekday, ...lesson } of lessons) {
    if (!Number.isInteger(storedWeekday) || storedWeekday < 0 || storedWeekday > 7) continue;
    const weekday = storedWeekday === 7 ? 0 : storedWeekday;
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

/** Projecta ocorrências autorizadas, sem reconstruir a repetição dos slots. */
export function timetableFromAcademicAgenda(
  events: AgendaEvent[],
  week: { start: string; end: string },
  className: string | null = null,
): StudentTimetable {
  const lessons = events.filter(
    (event) =>
      event.extendedProps.source === "lesson" &&
      !!event.end &&
      event.start.slice(0, 10) >= week.start &&
      event.start.slice(0, 10) < week.end,
  );
  const publishedAt =
    lessons
      .map((event) => event.extendedProps.publishedAt)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null;
  return {
    className,
    publishedAt,
    weekStart: week.start,
    days: groupTimetableByDay(
      lessons.map((event) => ({
        weekday: new Date(`${event.start.slice(0, 10)}T12:00:00Z`).getUTCDay(),
        slotId: event.extendedProps.sourceId.split("@")[0],
        startsAt: event.start.slice(11, 16),
        endsAt: event.end!.slice(11, 16),
        subjectName: event.extendedProps.subjectName ?? "Disciplina",
        teacherName: event.extendedProps.teacherName ?? null,
        className: event.extendedProps.classGroupName ?? null,
        room: event.extendedProps.room ?? null,
      })),
    ),
  };
}

export function studentUpcomingFromAcademicAgenda(
  events: AgendaEvent[],
  today: string,
  nowHhMm: string,
): Pick<StudentAgenda, "nextLesson" | "nextAssessment" | "upcomingAssessments"> {
  const now = Date.parse(`${today}T${nowHhMm.slice(0, 5)}:00+01:00`);
  const upcoming = events
    .filter((event) => event.start.slice(0, 10) >= today)
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const lesson = upcoming.find(
    (event) =>
      event.extendedProps.source === "lesson" && !!event.end && Date.parse(event.end) > now,
  );
  const upcomingAssessments = upcoming
    .filter(
      (event) =>
        event.extendedProps.source === "assessment" &&
        (event.allDay || !event.end || Date.parse(event.end) > now),
    )
    .slice(0, 8)
    .map((event) => ({
      name: event.title,
      subjectName: event.extendedProps.subjectName ?? "Disciplina",
      date: event.start.slice(0, 10),
      kind: event.extendedProps.assessmentKind ?? null,
    }));
  return {
    nextLesson: lesson
      ? {
          weekday: new Date(`${lesson.start.slice(0, 10)}T12:00:00Z`).getUTCDay(),
          startsAt: lesson.start.slice(11, 16),
          endsAt: lesson.end!.slice(11, 16),
          subjectName: lesson.extendedProps.subjectName ?? "Disciplina",
          daysAhead: Math.round(
            (Date.parse(`${lesson.start.slice(0, 10)}T00:00:00Z`) -
              Date.parse(`${today}T00:00:00Z`)) /
              86_400_000,
          ),
        }
      : null,
    nextAssessment: upcomingAssessments[0] ?? null,
    upcomingAssessments,
  };
}
