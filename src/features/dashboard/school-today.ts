import { todayInLuanda } from "@/features/calendar/dates";

/** Hora actual HH:MM no fuso Africa/Luanda. */
export function nowTimeInLuanda(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/** weekday JS: 0=Domingo … 6=Sábado (igual a `timetable_slots.weekday`). */
export function weekdayJsFromIso(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return new Date().getDay();
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function minutesFromHhMm(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function isStartingWithinMinutes(
  startsAt: string,
  nowHhMm: string,
  withinMinutes: number,
) {
  const start = minutesFromHhMm(startsAt);
  const now = minutesFromHhMm(nowHhMm);
  if (start == null || now == null) return false;
  return start >= now && start <= now + withinMinutes;
}

export function formatTodayLabelPt(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

export type SchoolTodayOps = {
  date: string;
  dateLabel: string;
  weekday: number;
  lessonsScheduled: number;
  teachersScheduled: number;
  classesWithLessons: number;
  roomsInUse: number;
  lessonsStartingSoon: number;
  attendanceSessionsOpen: number;
  attendanceSessionsDone: number;
  teachersCheckedIn: number;
  teachersPendingCheckIn: number;
  birthdaysToday: number;
  overdueInvoices: number;
  calendarItemsToday: number;
};

export function emptySchoolTodayOps(date = todayInLuanda()): SchoolTodayOps {
  return {
    date,
    dateLabel: formatTodayLabelPt(date),
    weekday: weekdayJsFromIso(date),
    lessonsScheduled: 0,
    teachersScheduled: 0,
    classesWithLessons: 0,
    roomsInUse: 0,
    lessonsStartingSoon: 0,
    attendanceSessionsOpen: 0,
    attendanceSessionsDone: 0,
    teachersCheckedIn: 0,
    teachersPendingCheckIn: 0,
    birthdaysToday: 0,
    overdueInvoices: 0,
    calendarItemsToday: 0,
  };
}

/** Escolhe a próxima aula a partir de sessões ordenadas por starts_at. */
export function pickNextLesson<T extends { starts_at: string; ends_at?: string; status?: string }>(
  sessions: T[],
  nowHhMm: string,
): T | null {
  const now = minutesFromHhMm(nowHhMm);
  if (now == null) return sessions[0] ?? null;
  const upcoming = sessions.filter((s) => {
    if (s.status === "cancelled") return false;
    const start = minutesFromHhMm(s.starts_at);
    const end = minutesFromHhMm(s.ends_at ?? s.starts_at);
    if (start == null) return false;
    if (end != null && end < now) return false;
    return true;
  });
  return upcoming[0] ?? null;
}
