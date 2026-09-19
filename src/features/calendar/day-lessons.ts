import { weekdayJsFromIso } from "@/features/dashboard/school-today";

export type DayAgendaLesson = {
  id: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  classGroupId: string | null;
  classGroupName: string;
  subjectId: string | null;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
};

export function sortDayAgendaLessons(lessons: DayAgendaLesson[]) {
  return [...lessons].sort(
    (a, b) =>
      a.startsAt.localeCompare(b.startsAt) ||
      a.classGroupName.localeCompare(b.classGroupName, "pt") ||
      a.subjectName.localeCompare(b.subjectName, "pt"),
  );
}

/** Limita a lista para a mini-agenda (topbar). */
export function takeUpcomingDayLessons(lessons: DayAgendaLesson[], nowHhMm: string, limit = 4) {
  const upcoming = lessons.filter((lesson) => lesson.endsAt >= nowHhMm.slice(0, 5));
  const source = upcoming.length ? upcoming : lessons;
  return source.slice(0, limit);
}

export function dayAgendaWeekday(isoDate: string) {
  return weekdayJsFromIso(isoDate);
}
