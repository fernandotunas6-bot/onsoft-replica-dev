/**
 * Resumo semanal da presença dos professores para a Direcção: por professor, as
 * aulas do horário já começadas, quantas têm a presença confirmada (e como), os
 * atrasos e as chamadas feitas sem presença na sala. É aqui que se vê quem finge
 * dar aulas: aulas sem presença e chamadas fechadas sem o professor ter lido o QR.
 */
import {
  TEACHER_LATE_GRACE_MINUTES,
  minutesOfDay,
  type TeacherCheckinMethod,
} from "@/features/pedagogica/teacher-presence";
import type { PresenceDecision } from "@/features/pedagogica/school-qr";

export type WeekLesson = {
  teacherId: string;
  date: string;
  startsAt: string | null;
  /** A sessão da chamada, quando já existe. */
  session: {
    status: string;
    checkedInAt: string | null;
    method: TeacherCheckinMethod | null;
    lateMinutes: number | null;
  } | null;
};

export type TeacherWeekRow = {
  teacherId: string;
  teacherName: string;
  /** Aulas do horário que já começaram (sem feriados). */
  scheduled: number;
  confirmed: number;
  byQr: number;
  /** Botão «Estou na sala» ou chamada concluída (modo botão). */
  bySelf: number;
  /** Registada pela Direcção. */
  byDirection: number;
  late: number;
  missing: number;
  /** Chamada fechada sem presença do professor: o sinal mais forte de fraude. */
  callsWithoutPresence: number;
  scansInReview: number;
  scansRejected: number;
  /** Percentagem de aulas com presença (0–100), ou null sem aulas. */
  rate: number | null;
};

/** Dias da semana (segunda a domingo) até hoje, sem feriados. */
export function weekLessonDates(input: { monday: string; today: string; holidays: Set<string> }) {
  const dates: string[] = [];
  const start = Date.parse(`${input.monday}T12:00:00Z`);
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    if (date > input.today) break;
    if (!input.holidays.has(date)) dates.push(date);
  }
  return dates;
}

/** A aula conta quando já começou: antes disso ninguém está em falta. */
export function lessonHasStarted(
  lesson: { date: string; startsAt: string | null },
  now: {
    today: string;
    time: string;
  },
) {
  if (lesson.date < now.today) return true;
  if (lesson.date > now.today) return false;
  const start = minutesOfDay(lesson.startsAt);
  const current = minutesOfDay(now.time);
  if (start == null || current == null) return false;
  return start <= current;
}

export function buildTeacherWeekReport(input: {
  lessons: WeekLesson[];
  scans: Array<{ teacherId: string; decision: PresenceDecision }>;
  names: Map<string, string>;
  now: { today: string; time: string };
}): { rows: TeacherWeekRow[]; totals: Omit<TeacherWeekRow, "teacherId" | "teacherName"> } {
  const rows = new Map<string, TeacherWeekRow>();
  const rowFor = (teacherId: string) => {
    let row = rows.get(teacherId);
    if (!row) {
      row = {
        teacherId,
        teacherName: input.names.get(teacherId) ?? "Professor",
        scheduled: 0,
        confirmed: 0,
        byQr: 0,
        bySelf: 0,
        byDirection: 0,
        late: 0,
        missing: 0,
        callsWithoutPresence: 0,
        scansInReview: 0,
        scansRejected: 0,
        rate: null,
      };
      rows.set(teacherId, row);
    }
    return row;
  };

  for (const lesson of input.lessons) {
    if (!lessonHasStarted(lesson, input.now)) continue;
    const row = rowFor(lesson.teacherId);
    row.scheduled += 1;
    const session = lesson.session;
    if (session?.checkedInAt) {
      row.confirmed += 1;
      if (session.method === "qr") row.byQr += 1;
      else if (session.method === "manual") row.byDirection += 1;
      else row.bySelf += 1;
      if ((session.lateMinutes ?? 0) > TEACHER_LATE_GRACE_MINUTES) row.late += 1;
    } else {
      row.missing += 1;
      if (session?.status === "completed") row.callsWithoutPresence += 1;
    }
  }
  for (const scan of input.scans) {
    if (scan.decision === "review") rowFor(scan.teacherId).scansInReview += 1;
    if (scan.decision === "rejected") rowFor(scan.teacherId).scansRejected += 1;
  }

  const list = [...rows.values()].map((row) => ({
    ...row,
    rate: row.scheduled ? Math.round((row.confirmed / row.scheduled) * 100) : null,
  }));
  list.sort(
    (a, b) =>
      b.callsWithoutPresence - a.callsWithoutPresence ||
      b.missing - a.missing ||
      b.late - a.late ||
      a.teacherName.localeCompare(b.teacherName, "pt"),
  );

  const totals = list.reduce(
    (sum, row) => ({
      scheduled: sum.scheduled + row.scheduled,
      confirmed: sum.confirmed + row.confirmed,
      byQr: sum.byQr + row.byQr,
      bySelf: sum.bySelf + row.bySelf,
      byDirection: sum.byDirection + row.byDirection,
      late: sum.late + row.late,
      missing: sum.missing + row.missing,
      callsWithoutPresence: sum.callsWithoutPresence + row.callsWithoutPresence,
      scansInReview: sum.scansInReview + row.scansInReview,
      scansRejected: sum.scansRejected + row.scansRejected,
      rate: null as number | null,
    }),
    {
      scheduled: 0,
      confirmed: 0,
      byQr: 0,
      bySelf: 0,
      byDirection: 0,
      late: 0,
      missing: 0,
      callsWithoutPresence: 0,
      scansInReview: 0,
      scansRejected: 0,
      rate: null as number | null,
    },
  );
  totals.rate = totals.scheduled ? Math.round((totals.confirmed / totals.scheduled) * 100) : null;
  return { rows: list, totals };
}

/** Colunas do CSV (`exportCsv`), para a Direcção arquivar ou enviar. */
export const TEACHER_WEEK_CSV_COLUMNS: ReadonlyArray<{
  label: string;
  value: (row: TeacherWeekRow) => string | number | null;
}> = [
  { label: "Professor", value: (row) => row.teacherName },
  { label: "Aulas", value: (row) => row.scheduled },
  { label: "Com presença", value: (row) => row.confirmed },
  { label: "Por QR", value: (row) => row.byQr },
  { label: "Pelo professor", value: (row) => row.bySelf },
  { label: "Pela Direcção", value: (row) => row.byDirection },
  { label: "Atrasos", value: (row) => row.late },
  { label: "Sem presença", value: (row) => row.missing },
  { label: "Chamadas sem presença", value: (row) => row.callsWithoutPresence },
  { label: "Leituras por rever", value: (row) => row.scansInReview },
  { label: "Leituras recusadas", value: (row) => row.scansRejected },
  { label: "Presença (%)", value: (row) => row.rate },
];
