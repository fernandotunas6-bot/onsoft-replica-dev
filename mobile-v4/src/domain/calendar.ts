import type { Workspace, Context, AttendanceStatus, Lesson } from "./model";
export type DayStatus = AttendanceStatus | "misto" | "pendente" | "sem-aulas";
export interface DaySummary {
  date: string;
  lessons: Lesson[];
  statuses: (AttendanceStatus | "pendente")[];
  status: DayStatus;
  present: number;
  absent: number;
  justified: number;
}
export function luandaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Luanda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map((t) => parts.find((p) => p.type === t)!.value).join("-");
}
export function summaryForDay(data: Workspace, ctx: Context, date: string): DaySummary {
  if (data.schoolId !== ctx.schoolId) throw new Error("Escola inválida.");
  const groups = data.classes.filter((g) =>
    ctx.role === "professor"
      ? g.teacherUserId === ctx.userId
      : g.students.some((s) => s.userId === ctx.userId),
  );
  const ids = new Set(groups.map((g) => g.id));
  const students = new Set(
    groups.flatMap((g) => g.students.filter((s) => s.userId === ctx.userId).map((s) => s.id)),
  );
  const lessons = data.lessons.filter((l) => l.date === date && ids.has(l.classId));
  const statuses = lessons.map((l) =>
    ctx.role === "professor"
      ? (data.teacherAttendance || []).find((a) => a.lessonId === l.id && a.userId === ctx.userId)
          ?.status || "pendente"
      : data.attendance.find((a) => a.lessonId === l.id && students.has(a.studentId))?.status ||
        "pendente",
  );
  const distinct = new Set(statuses);
  const status: DayStatus = !lessons.length
    ? "sem-aulas"
    : distinct.size > 1
      ? "misto"
      : statuses[0];
  return {
    date,
    lessons,
    statuses,
    status,
    present: statuses.filter((s) => s === "presente").length,
    absent: statuses.filter((s) => s === "ausente").length,
    justified: statuses.filter((s) => s === "justificada").length,
  };
}
export function daysOfMonth(month: string) {
  const [year, m] = month.split("-").map(Number);
  return Array.from(
    { length: new Date(Date.UTC(year, m, 0)).getUTCDate() },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}
export function yearDays(year: number) {
  const days: string[] = [];
  for (
    let date = new Date(Date.UTC(year, 0, 1));
    date.getUTCFullYear() === year;
    date = new Date(date.getTime() + 86400000)
  )
    days.push(date.toISOString().slice(0, 10));
  return days;
}
export function calendarStats(data: Workspace, ctx: Context, dates: string[]) {
  const summaries = dates.map((d) => summaryForDay(data, ctx, d));
  return {
    present: summaries.reduce((n, d) => n + d.present, 0),
    absent: summaries.reduce((n, d) => n + d.absent, 0),
    justified: summaries.reduce((n, d) => n + d.justified, 0),
    activeDays: summaries.filter((d) => d.present > 0).length,
    total: summaries.reduce((n, d) => n + d.lessons.length, 0),
  };
}
