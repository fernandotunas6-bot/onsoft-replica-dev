/**
 * Leituras do horário que as ferramentas de referência (Untis, aSc, FET) dão ao
 * planeador: carga e furos dos professores, qualidade do horário da turma, ocupação
 * das salas, salas livres e substitutos. Só lêem as aulas já carregadas: não gravam.
 */
import type { ScheduleRoom, ScheduleSlot, ScheduleTeacher } from "../types";
import { PLACEHOLDER_ROOM_LABELS } from "./conflicts";

/** Um vazio a partir daqui é um «furo»; abaixo é a mudança de sala ou o intervalo. */
export const GAP_MINUTES = 30;
/** Aula imediatamente antes ou depois: o professor já está na escola. */
const ADJACENT_MINUTES = 15;

export function minutesOf(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function overlaps(a: { starts_at: string; ends_at: string }, start: number, end: number) {
  return minutesOf(a.starts_at) < end && start < minutesOf(a.ends_at);
}

function byStart(a: ScheduleSlot, b: ScheduleSlot) {
  return a.weekday - b.weekday || minutesOf(a.starts_at) - minutesOf(b.starts_at);
}

function roomLabelKey(value: string | null | undefined) {
  const key = (value ?? "").trim().toLowerCase();
  return (PLACEHOLDER_ROOM_LABELS as readonly string[]).includes(key) ? "" : key;
}

/** A aula usa esta sala (pela ligação ao cadastro ou, sem ela, pelo nome). */
export function slotUsesRoom(slot: ScheduleSlot, room: ScheduleRoom) {
  if (slot.room_id) return slot.room_id === room.id;
  const key = roomLabelKey(slot.room_name ?? slot.label);
  return key !== "" && key === room.name.trim().toLowerCase();
}

type DayRun = { lessons: number; gaps: number; gapMinutes: number; longestRun: number };

function dayRuns(slots: ScheduleSlot[]): Map<number, DayRun> {
  const days = new Map<number, DayRun>();
  const sorted = [...slots].sort(byStart);
  let run = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const slot = sorted[i]!;
    const previous = sorted[i - 1];
    const day = days.get(slot.weekday) ?? { lessons: 0, gaps: 0, gapMinutes: 0, longestRun: 0 };
    if (!previous || previous.weekday !== slot.weekday) run = 0;
    else {
      const gap = minutesOf(slot.starts_at) - minutesOf(previous.ends_at);
      if (gap >= GAP_MINUTES) {
        day.gaps += 1;
        day.gapMinutes += gap;
        run = 0;
      }
    }
    run += 1;
    day.lessons += 1;
    day.longestRun = Math.max(day.longestRun, run);
    days.set(slot.weekday, day);
  }
  return days;
}

export type TeacherLoad = {
  teacherId: string;
  name: string;
  lessons: number;
  minutes: number;
  days: number;
  perDay: Record<number, number>;
  /** Maior sequência de aulas seguidas num dia (o intervalo curto não a quebra). */
  longestRun: number;
  gaps: number;
  gapMinutes: number;
  maxWeekly: number | null;
  overLimit: boolean;
};

/** Carga semanal de cada professor, com furos e sequências longas. */
export function teacherLoads(slots: ScheduleSlot[], teachers: ScheduleTeacher[]): TeacherLoad[] {
  return teachers
    .map((teacher) => {
      const own = slots.filter((slot) => slot.teacher_id === teacher.id);
      const days = dayRuns(own);
      const perDay: Record<number, number> = {};
      let gaps = 0;
      let gapMinutes = 0;
      let longestRun = 0;
      for (const [weekday, day] of days) {
        perDay[weekday] = day.lessons;
        gaps += day.gaps;
        gapMinutes += day.gapMinutes;
        longestRun = Math.max(longestRun, day.longestRun);
      }
      const minutes = own.reduce(
        (total, slot) => total + minutesOf(slot.ends_at) - minutesOf(slot.starts_at),
        0,
      );
      const maxWeekly = teacher.max_weekly_hours ?? null;
      return {
        teacherId: teacher.id,
        name: teacher.name,
        lessons: own.length,
        minutes,
        days: days.size,
        perDay,
        longestRun,
        gaps,
        gapMinutes,
        maxWeekly,
        overLimit: maxWeekly !== null && minutes / 60 > maxWeekly,
      };
    })
    .filter((load) => load.lessons > 0)
    .sort((a, b) => b.lessons - a.lessons || a.name.localeCompare(b.name, "pt"));
}

export type QualityIssue = {
  code: "gap" | "subject_day_overload" | "unbalanced_days" | "subject_clustered" | "long_run";
  message: string;
};

const WEEKDAY_NAMES = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/**
 * Qualidade do horário de uma turma, como os critérios do FET: furos dos alunos, a
 * mesma disciplina mais de duas vezes no dia, dias desequilibrados e disciplinas
 * concentradas em poucos dias. Pontuação de 0 a 100 (100 = sem avisos).
 */
export function classTimetableQuality(slots: ScheduleSlot[]): {
  score: number;
  issues: QualityIssue[];
  perDay: Record<number, number>;
} {
  const issues: QualityIssue[] = [];
  const days = dayRuns(slots);
  const perDay: Record<number, number> = {};
  for (const [weekday, day] of days) {
    perDay[weekday] = day.lessons;
    if (day.gaps)
      issues.push({
        code: "gap",
        message: `${day.gaps === 1 ? "Um furo" : `${day.gaps} furos`} na ${WEEKDAY_NAMES[weekday]} (${day.gapMinutes} min sem aula entre aulas).`,
      });
    if (day.longestRun >= 7)
      issues.push({
        code: "long_run",
        message: `${day.longestRun} aulas seguidas na ${WEEKDAY_NAMES[weekday]}.`,
      });
  }
  const counts = [...days.values()].map((day) => day.lessons);
  if (counts.length > 1 && Math.max(...counts) - Math.min(...counts) >= 3) {
    issues.push({
      code: "unbalanced_days",
      message: `Dias desequilibrados: de ${Math.min(...counts)} a ${Math.max(...counts)} aulas por dia.`,
    });
  }
  const bySubject = new Map<string, ScheduleSlot[]>();
  for (const slot of slots) {
    const key = slot.subject_name ?? slot.subject_id ?? "";
    if (!key) continue;
    bySubject.set(key, [...(bySubject.get(key) ?? []), slot]);
  }
  for (const [subject, lessons] of bySubject) {
    const perSubjectDay = new Map<number, number>();
    for (const lesson of lessons)
      perSubjectDay.set(lesson.weekday, (perSubjectDay.get(lesson.weekday) ?? 0) + 1);
    for (const [weekday, count] of perSubjectDay)
      if (count > 2)
        issues.push({
          code: "subject_day_overload",
          message: `${subject}: ${count} aulas na ${WEEKDAY_NAMES[weekday]}.`,
        });
    // Distribuir ajuda a reter: n aulas pedem pelo menos n−1 dias diferentes da semana
    // lectiva (um tempo duplo é aceite).
    const wanted = Math.min(lessons.length, Math.max(5, days.size)) - 1;
    if (lessons.length >= 3 && perSubjectDay.size < wanted)
      issues.push({
        code: "subject_clustered",
        message: `${subject}: ${lessons.length} aulas em só ${perSubjectDay.size} ${perSubjectDay.size === 1 ? "dia" : "dias"}.`,
      });
  }
  const penalty: Record<QualityIssue["code"], number> = {
    gap: 8,
    subject_day_overload: 10,
    unbalanced_days: 6,
    subject_clustered: 5,
    long_run: 6,
  };
  const score = Math.max(0, 100 - issues.reduce((total, issue) => total + penalty[issue.code], 0));
  return { score, issues, perDay };
}

/** Janelas de aula distintas da escola (início–fim), por ordem. */
export function lessonWindows(slots: ScheduleSlot[]) {
  const seen = new Map<string, { startsAt: string; endsAt: string }>();
  for (const slot of slots) {
    const startsAt = slot.starts_at.slice(0, 5);
    const endsAt = slot.ends_at.slice(0, 5);
    seen.set(`${startsAt}-${endsAt}`, { startsAt, endsAt });
  }
  return [...seen.values()].sort((a, b) => minutesOf(a.startsAt) - minutesOf(b.startsAt));
}

export type RoomOccupancy = {
  roomId: string;
  name: string;
  lessons: number;
  /** Fracção das janelas de aula da semana (dias com aulas × janelas) em que está ocupada. */
  share: number;
  busiestWeekday: number | null;
};

export function roomOccupancy(slots: ScheduleSlot[], rooms: ScheduleRoom[]): RoomOccupancy[] {
  const teachingDays = new Set(slots.map((slot) => slot.weekday)).size || 5;
  const capacity = Math.max(1, lessonWindows(slots).length * teachingDays);
  return rooms
    .map((room) => {
      const used = slots.filter((slot) => slotUsesRoom(slot, room));
      const perDay = new Map<number, number>();
      for (const slot of used) perDay.set(slot.weekday, (perDay.get(slot.weekday) ?? 0) + 1);
      const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      return {
        roomId: room.id,
        name: room.name,
        lessons: used.length,
        share: Math.min(1, used.length / capacity),
        busiestWeekday: busiest?.[0] ?? null,
      };
    })
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name, "pt"));
}

/** Salas sem aula no intervalo; primeiro as que cabem a turma, da mais justa à maior. */
export function freeRooms(input: {
  slots: ScheduleSlot[];
  rooms: ScheduleRoom[];
  weekday: number;
  startsAt: string;
  endsAt: string;
  minCapacity?: number;
}): Array<ScheduleRoom & { fits: boolean }> {
  const start = minutesOf(input.startsAt);
  const end = minutesOf(input.endsAt);
  const need = input.minCapacity ?? 0;
  return input.rooms
    .filter(
      (room) =>
        !input.slots.some(
          (slot) =>
            slot.weekday === input.weekday &&
            overlaps(slot, start, end) &&
            slotUsesRoom(slot, room),
        ),
    )
    .map((room) => ({ ...room, fits: need === 0 || (room.capacity ?? 0) >= need }))
    .sort(
      (a, b) =>
        Number(b.fits) - Number(a.fits) ||
        (a.capacity ?? Infinity) - (b.capacity ?? Infinity) ||
        a.name.localeCompare(b.name, "pt"),
    );
}

export type SubstituteCandidate = {
  teacherId: string;
  name: string;
  knowsClass: boolean;
  knowsSubject: boolean;
  /** Tem aula logo antes ou logo depois: já está na escola. */
  adjacent: boolean;
  lessonsThatDay: number;
  score: number;
};

/**
 * Quem pode cobrir uma aula, ordenado como no WebUntis: livre no intervalo, depois
 * «conhece a disciplina», «conhece a turma», já está na escola e dia menos carregado.
 */
export function substituteCandidates(input: {
  slots: ScheduleSlot[];
  teachers: ScheduleTeacher[];
  target: Pick<
    ScheduleSlot,
    "weekday" | "starts_at" | "ends_at" | "teacher_id" | "class_group_id" | "subject_id"
  >;
}): SubstituteCandidate[] {
  const { target } = input;
  const start = minutesOf(target.starts_at);
  const end = minutesOf(target.ends_at);
  return input.teachers
    .filter((teacher) => teacher.id !== target.teacher_id)
    .flatMap((teacher) => {
      const own = input.slots.filter((slot) => slot.teacher_id === teacher.id);
      const sameDay = own.filter((slot) => slot.weekday === target.weekday);
      if (sameDay.some((slot) => overlaps(slot, start, end))) return [];
      const knowsClass = own.some((slot) => slot.class_group_id === target.class_group_id);
      const knowsSubject = own.some((slot) => slot.subject_id === target.subject_id);
      const adjacent = sameDay.some(
        (slot) =>
          Math.abs(minutesOf(slot.ends_at) - start) <= ADJACENT_MINUTES ||
          Math.abs(minutesOf(slot.starts_at) - end) <= ADJACENT_MINUTES,
      );
      const lessonsThatDay = sameDay.length;
      const score =
        (knowsSubject ? 4 : 0) +
        (knowsClass ? 3 : 0) +
        (adjacent ? 2 : 0) +
        (lessonsThatDay > 0 ? 1 : 0) -
        (lessonsThatDay >= 6 ? 3 : 0);
      return [
        {
          teacherId: teacher.id,
          name: teacher.name,
          knowsClass,
          knowsSubject,
          adjacent,
          lessonsThatDay,
          score,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.lessonsThatDay - b.lessonsThatDay ||
        a.name.localeCompare(b.name, "pt"),
    );
}
