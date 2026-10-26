/**
 * Proposta automática do horário de uma turma: preenche só os tempos que faltam a cada
 * disciplina (carga semanal − aulas já marcadas), sem tocar no que existe. É uma
 * proposta para rever: nada é gravado aqui, e cada aula aplicada passa pelas mesmas
 * validações do servidor que uma aula criada à mão.
 *
 * Regras, por ordem: turma, professor e sala livres; limite diário configurável
 * por disciplina; espalhar pelos dias e preferir equilíbrio e menos furos. As
 * disciplinas mais difíceis de encaixar (professor com menos tempos livres) vão primeiro.
 */
import type {
  ScheduleClassSubject,
  ScheduleSlot,
  ScheduleSubject,
  ScheduleTeacher,
  ScheduleRoom,
} from "../types";
import { lessonWindows, slotUsesRoom } from "./insights";
import { scheduleTimeSeconds, assertValidScheduleTime } from "./validation";
const timeMinutes = (value: string) => scheduleTimeSeconds(value) / 60;

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

/** Exemplo de grelha para ensaios; nunca é aplicado como configuração institucional. */
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

/** Janelas observadas para diagnóstico; sem elas devolve vazio, sem inventar grelha. */
export function windowsForShift(slots: ScheduleSlot[], shift: string | null | undefined) {
  const range = shift ? SHIFT_RANGE[shift] : undefined;
  const used = lessonWindows(slots).filter((window) => {
    const start = timeMinutes(window.startsAt);
    return range ? start >= range[0] && start < range[1] : true;
  });
  // Janelas sobrepostas (duas grelhas no mesmo turno) não servem de grelha comum.
  const disjoint = used.every(
    (window, i) => i === 0 || timeMinutes(window.startsAt) >= timeMinutes(used[i - 1]!.endsAt),
  );
  return used.length > 0 && disjoint ? used : [];
}

function overlaps(slot: ScheduleSlot, window: LessonWindow) {
  return (
    timeMinutes(slot.starts_at) < timeMinutes(window.endsAt) &&
    timeMinutes(window.startsAt) < timeMinutes(slot.ends_at)
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
  windows: LessonWindow[];
  rooms?: ScheduleRoom[];
  minCapacity?: number;
  maxPerDay?: number;
}): { placements: ProposedLesson[]; unplaced: UnplacedSubject[]; windows: LessonWindow[] } {
  const weekdays = [...new Set(input.weekdays ?? [])].sort((a, b) => a - b);
  const windows = [...input.windows];
  for (const day of weekdays) {
    if (!Number.isInteger(day) || day < 1 || day > 7) throw new Error("Dia lectivo inválido.");
  }
  for (const window of windows) assertValidScheduleTime(1, window.startsAt, window.endsAt);
  windows.sort((a, b) => scheduleTimeSeconds(a.startsAt) - scheduleTimeSeconds(b.startsAt));
  if (
    windows.some(
      (window, i) =>
        i > 0 && scheduleTimeSeconds(window.startsAt) < scheduleTimeSeconds(windows[i - 1]!.endsAt),
    )
  ) {
    throw new Error("Os tempos propostos sobrepõem-se.");
  }
  const maxPerDay = input.maxPerDay ?? MAX_PER_DAY;
  if (!Number.isInteger(maxPerDay) || maxPerDay < 1 || maxPerDay > 20)
    throw new Error("Limite diário inválido.");
  const subjectName = new Map(input.subjects.map((s) => [s.id, s.name]));
  const teacherName = new Map(input.teachers.map((t) => [t.id, t.name]));
  const classSlots = input.slots.filter((slot) => slot.class_group_id === input.classGroupId);
  const unplaced: UnplacedSubject[] = [];
  const versions = new Set(classSlots.map((s) => s.schedule_id ?? "__legacy__"));
  if (versions.size > 1) {
    return {
      placements: [],
      windows,
      unplaced: input.classSubjects
        .filter((cs) => cs.class_group_id === input.classGroupId)
        .map((cs) => ({
          subjectId: cs.subject_id,
          subjectName: subjectName.get(cs.subject_id) ?? "Disciplina",
          missing: Math.max(0, Number(cs.weekly_periods ?? 0)),
          reason: "Existem várias versões da turma. Reveja a versão do horário antes de gerar.",
        })),
    };
  }

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
        timeMinutes(p.startsAt) < timeMinutes(window.endsAt) &&
        timeMinutes(window.startsAt) < timeMinutes(p.endsAt) &&
        test(p),
    );

  type Demand = { subjectId: string; teacherId: string; missing: number; roomId: string | null };
  const demands: Demand[] = [];
  for (const cs of input.classSubjects.filter((c) => c.class_group_id === input.classGroupId)) {
    const weekly = Number(cs.weekly_periods ?? 0);
    const existing = classSlots.filter((slot) => slot.subject_id === cs.subject_id);
    const missing = weekly - existing.length;
    if (!Number.isFinite(missing) || missing <= 0) continue;
    if (!windows.length || !weekdays.length) {
      unplaced.push({
        subjectId: cs.subject_id,
        subjectName: subjectName.get(cs.subject_id) ?? "Disciplina",
        missing,
        reason: "Configure os dias e os tempos lectivos do turno antes de gerar.",
      });
      continue;
    }
    const name = subjectName.get(cs.subject_id) ?? "Disciplina";
    if (!cs.teacher_id || !teacherName.has(cs.teacher_id)) {
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

  const availableRoom = (demand: Demand, weekday: number, window: LessonWindow) => {
    const eligible = (input.rooms ?? []).filter(
      (r) => r.capacity != null && r.capacity > 0 && r.capacity >= (input.minCapacity ?? 0),
    );
    eligible.sort((a, b) => Number(b.id === demand.roomId) - Number(a.id === demand.roomId));
    return eligible.find(
      (room) =>
        !input.slots.some(
          (s) => s.weekday === weekday && slotUsesRoom(s, room) && overlaps(s, window),
        ),
    );
  };
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
        if (sameSubject >= maxPerDay) continue;
        const dayLoad =
          classSlots.filter((s) => s.weekday === weekday).length +
          placed.filter((p) => p.weekday === weekday).length;
        for (const [index, window] of windows.entries()) {
          if (!availableRoom(demand, weekday, window)) continue;
          const limit = input.teachers.find((t) => t.id === demand.teacherId)?.max_weekly_hours;
          const minutes =
            input.slots
              .filter((s) => s.teacher_id === demand.teacherId)
              .reduce((n, s) => n + timeMinutes(s.ends_at) - timeMinutes(s.starts_at), 0) +
            placed
              .filter((p) => p.teacherId === demand.teacherId)
              .reduce((n, p) => n + timeMinutes(p.endsAt) - timeMinutes(p.startsAt), 0) +
            timeMinutes(window.endsAt) -
            timeMinutes(window.startsAt);
          if (limit != null && minutes > limit * 60) continue;
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
      const room = availableRoom(demand, chosen.weekday, chosen.window)!;
      placed.push({
        subjectId: demand.subjectId,
        subjectName: name,
        teacherId: demand.teacherId,
        teacherName: teacherName.get(demand.teacherId) ?? null,
        weekday: chosen.weekday,
        startsAt: chosen.window.startsAt,
        endsAt: chosen.window.endsAt,
        roomId: room.id,
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
          ? `Não há tempos em que a turma e ${teacherName.get(demand.teacherId) ?? "o professor"} estejam livres sem passar de ${maxPerDay} aulas por dia, respeitando salas e carga docente.`
          : `${teacherName.get(demand.teacherId) ?? "O professor"} não tem tempos livres nesta grelha.`,
      });
    }
  }

  placed.sort((a, b) => a.weekday - b.weekday || timeMinutes(a.startsAt) - timeMinutes(b.startsAt));
  return { placements: placed, unplaced, windows };
}
