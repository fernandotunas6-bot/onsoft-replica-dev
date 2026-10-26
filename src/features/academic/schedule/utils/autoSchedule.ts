/**
 * Proposta automática do horário de uma turma: preenche só os tempos que faltam a cada
 * disciplina (carga semanal − aulas já marcadas), sem tocar no que existe. É uma
 * proposta para rever: nada é gravado aqui, e cada aula aplicada passa pelas mesmas
 * validações do servidor que uma aula criada à mão.
 *
 * Regras, por ordem: turma, professor e sala livres; no máximo 2 aulas da mesma
 * disciplina por dia; espalhar pelos dias; dias equilibrados; sem abrir furos. As
 * disciplinas mais difíceis de encaixar (professor com menos tempos livres) vão primeiro.
 */
import type {
  ScheduleClassSubject,
  ScheduleSlot,
  ScheduleSubject,
  ScheduleTeacher,
} from "../types";
import { lessonWindows, minutesOf } from "./insights";

export type LessonWindow = { startsAt: string; endsAt: string };

export type ProposedLesson = {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
};

export type UnplacedSubject = {
  subjectId: string;
  subjectName: string;
  missing: number;
  reason: string;
};

const MAX_PER_DAY = 2;

function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 45 min de aula, 5 de mudança e 20 de intervalo depois do 3.º tempo. */
export function defaultWindows(shift: string | null | undefined): LessonWindow[] {
  const start = shift === "afternoon" ? 13 * 60 : shift === "evening" ? 18 * 60 + 30 : 7 * 60;
  const count = shift === "evening" ? 5 : 6;
  const windows: LessonWindow[] = [];
  let cursor = start;
  for (let i = 0; i < count; i += 1) {
    windows.push({ startsAt: hhmm(cursor), endsAt: hhmm(cursor + 45) });
    cursor += 45 + (i === 2 ? 20 : 5);
  }
  return windows;
}

const SHIFT_RANGE: Record<string, [number, number]> = {
  morning: [6 * 60, 13 * 60],
  afternoon: [13 * 60, 18 * 60 + 30],
  evening: [18 * 60 + 30, 24 * 60],
};

/** Os tempos que a escola já usa neste turno; sem eles, a grelha por omissão. */
export function windowsForShift(slots: ScheduleSlot[], shift: string | null | undefined) {
  const range = shift ? SHIFT_RANGE[shift] : undefined;
  const used = lessonWindows(slots).filter((window) => {
    const start = minutesOf(window.startsAt);
    return range ? start >= range[0] && start < range[1] : true;
  });
  // Janelas sobrepostas (duas grelhas no mesmo turno) não servem de grelha comum.
  const disjoint = used.every(
    (window, i) => i === 0 || minutesOf(window.startsAt) >= minutesOf(used[i - 1]!.endsAt),
  );
  return used.length >= 4 && disjoint ? used : defaultWindows(shift);
}

function overlaps(slot: ScheduleSlot, window: LessonWindow) {
  return (
    minutesOf(slot.starts_at) < minutesOf(window.endsAt) &&
    minutesOf(window.startsAt) < minutesOf(slot.ends_at)
  );
}

export function proposeTimetable(input: {
  classGroupId: string;
  shift?: string | null;
  classSubjects: ScheduleClassSubject[];
  subjects: ScheduleSubject[];
  teachers: ScheduleTeacher[];
  slots: ScheduleSlot[];
  weekdays?: number[];
  windows?: LessonWindow[];
}): { placements: ProposedLesson[]; unplaced: UnplacedSubject[]; windows: LessonWindow[] } {
  const weekdays = input.weekdays ?? [1, 2, 3, 4, 5];
  const windows = input.windows ?? windowsForShift(input.slots, input.shift);
  const subjectName = new Map(input.subjects.map((s) => [s.id, s.name]));
  const teacherName = new Map(input.teachers.map((t) => [t.id, t.name]));
  const classSlots = input.slots.filter((slot) => slot.class_group_id === input.classGroupId);
  const unplaced: UnplacedSubject[] = [];

  // Ocupação: [dia][janela] da turma; por professor e por sala, pelas aulas da escola.
  const busy =
    (filter: (slot: ScheduleSlot) => boolean) => (weekday: number, window: LessonWindow) =>
      input.slots.some(
        (slot) => slot.weekday === weekday && filter(slot) && overlaps(slot, window),
      );
  const classBusy = busy((slot) => slot.class_group_id === input.classGroupId);
  const placed: ProposedLesson[] = [];
  const placedAt = (weekday: number, window: LessonWindow, test: (p: ProposedLesson) => boolean) =>
    placed.some(
      (p) =>
        p.weekday === weekday &&
        minutesOf(p.startsAt) < minutesOf(window.endsAt) &&
        minutesOf(window.startsAt) < minutesOf(p.endsAt) &&
        test(p),
    );

  type Demand = { subjectId: string; teacherId: string; missing: number; roomId: string | null };
  const demands: Demand[] = [];
  for (const cs of input.classSubjects.filter((c) => c.class_group_id === input.classGroupId)) {
    const weekly = Number(cs.weekly_periods ?? 0);
    const existing = classSlots.filter((slot) => slot.subject_id === cs.subject_id);
    const missing = weekly - existing.length;
    if (!Number.isFinite(missing) || missing <= 0) continue;
    const name = subjectName.get(cs.subject_id) ?? "Disciplina";
    if (!cs.teacher_id) {
      unplaced.push({
        subjectId: cs.subject_id,
        subjectName: name,
        missing,
        reason: "Sem professor atribuído à disciplina nesta turma.",
      });
      continue;
    }
    // A sala que a disciplina (ou, sem ela, a turma) já usa.
    const roomVotes = new Map<string, number>();
    for (const slot of existing.length ? existing : classSlots)
      if (slot.room_id) roomVotes.set(slot.room_id, (roomVotes.get(slot.room_id) ?? 0) + 1);
    const roomId = [...roomVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    demands.push({ subjectId: cs.subject_id, teacherId: cs.teacher_id, missing, roomId });
  }

  const teacherBusy = (teacherId: string) => busy((slot) => slot.teacher_id === teacherId);
  const freeCells = (demand: Demand) =>
    weekdays.flatMap((weekday) =>
      windows
        .filter(
          (window) =>
            !classBusy(weekday, window) && !teacherBusy(demand.teacherId)(weekday, window),
        )
        .map((window) => ({ weekday, window })),
    );
  // Mais difíceis primeiro: menos tempos livres do professor por aula a marcar.
  demands.sort(
    (a, b) =>
      freeCells(a).length / a.missing - freeCells(b).length / b.missing || b.missing - a.missing,
  );

  for (const demand of demands) {
    const name = subjectName.get(demand.subjectId) ?? "Disciplina";
    let remaining = demand.missing;
    while (remaining > 0) {
      let best: { weekday: number; window: LessonWindow; score: number } | null = null;
      for (const weekday of weekdays) {
        const sameSubject =
          classSlots.filter((s) => s.weekday === weekday && s.subject_id === demand.subjectId)
            .length +
          placed.filter((p) => p.weekday === weekday && p.subjectId === demand.subjectId).length;
        if (sameSubject >= MAX_PER_DAY) continue;
        const dayLoad =
          classSlots.filter((s) => s.weekday === weekday).length +
          placed.filter((p) => p.weekday === weekday).length;
        for (const [index, window] of windows.entries()) {
          if (classBusy(weekday, window)) continue;
          if (placedAt(weekday, window, () => true)) continue;
          if (teacherBusy(demand.teacherId)(weekday, window)) continue;
          if (placedAt(weekday, window, (p) => p.teacherId === demand.teacherId)) continue;
          // Furo: deixar livre um tempo antes deste no mesmo dia.
          const gapBefore = windows
            .slice(0, index)
            .some((w) => !classBusy(weekday, w) && !placedAt(weekday, w, () => true));
          const score =
            (sameSubject === 0 ? 10 : 0) - dayLoad * 2 - (gapBefore ? 6 : 0) - index * 0.1;
          if (!best || score > best.score) best = { weekday, window, score };
        }
      }
      if (!best) break;
      const chosen = best as { weekday: number; window: LessonWindow; score: number };
      const roomFree =
        demand.roomId !== null &&
        !input.slots.some(
          (slot) =>
            slot.weekday === chosen.weekday &&
            slot.room_id === demand.roomId &&
            slot.class_group_id !== input.classGroupId &&
            overlaps(slot, chosen.window),
        );
      placed.push({
        subjectId: demand.subjectId,
        subjectName: name,
        teacherId: demand.teacherId,
        teacherName: teacherName.get(demand.teacherId) ?? null,
        weekday: chosen.weekday,
        startsAt: chosen.window.startsAt,
        endsAt: chosen.window.endsAt,
        roomId: roomFree ? demand.roomId : null,
      });
      remaining -= 1;
    }
    if (remaining > 0) {
      const teacherFree = weekdays.some((weekday) =>
        windows.some(
          (window) =>
            !teacherBusy(demand.teacherId)(weekday, window) &&
            !placedAt(weekday, window, (p) => p.teacherId === demand.teacherId),
        ),
      );
      unplaced.push({
        subjectId: demand.subjectId,
        subjectName: name,
        missing: remaining,
        reason: teacherFree
          ? `Não há tempos em que a turma e ${teacherName.get(demand.teacherId) ?? "o professor"} estejam livres sem passar de ${MAX_PER_DAY} aulas por dia.`
          : `${teacherName.get(demand.teacherId) ?? "O professor"} não tem tempos livres nesta grelha.`,
      });
    }
  }

  placed.sort((a, b) => a.weekday - b.weekday || minutesOf(a.startsAt) - minutesOf(b.startsAt));
  return { placements: placed, unplaced, windows };
}
