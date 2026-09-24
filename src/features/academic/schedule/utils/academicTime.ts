/**
 * School-local civil-time planner. All periods are [start,end): touching boundaries
 * are valid. This module intentionally rejects overnight shifts: split them by date.
 * Convert occurrences to UTC only at the server boundary with an IANA time zone.
 */
export type TimeInterval = { start: string; end: string };
export type AcademicPeriod = {
  id: string; name: string; startsOn: string; endsOn: string;
  teachingDays: readonly number[]; // ISO: Monday=1 ... Sunday=7
};
export type AcademicShift = {
  id: string; name: string; entry: string; exit: string;
  lessons: readonly (TimeInterval & { id: string })[];
  breaks: readonly (TimeInterval & { id: string; name: string })[];
  gateEntryMinutesBefore: number;
  gateExitMinutesAfter: number;
};
export type PlannedLesson = {
  id: string; periodId: string; shiftId: string; weekday: number;
  start: string; end: string; teacherId: string; classGroupId: string; roomId?: string | null;
};
export type LessonOccurrence = PlannedLesson & { date: string; startsAtLocal: string; endsAtLocal: string };
export type PlanningIssue = { code: string; message: string; ids: string[] };
export type PlanningResult = { issues: PlanningIssue[]; occurrences: LessonOccurrence[] };

const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
export function parseLocalMinute(value: string): number {
  const match = timePattern.exec(value);
  if (!match) throw new Error("Hora inválida; utilize HH:mm ou HH:mm:ss.");
  if (match[3] && match[3] !== "00") throw new Error("Horários lectivos devem usar minutos inteiros.");
  return Number(match[1]) * 60 + Number(match[2]);
}
export function parseCivilDate(value: string): number {
  if (!datePattern.test(value)) throw new Error("Data inválida; utilize AAAA-MM-DD.");
  const [year, month, day] = value.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  if (new Date(utc).toISOString().slice(0, 10) !== value) throw new Error("Data inexistente.");
  return utc;
}
function interval(value: TimeInterval): [number, number] {
  const start = parseLocalMinute(value.start);
  const end = parseLocalMinute(value.end);
  if (end <= start) throw new Error("O fim deve ser posterior ao início, no mesmo dia.");
  return [start, end];
}
function overlap(a: TimeInterval, b: TimeInterval): boolean {
  const [as, ae] = interval(a);
  const [bs, be] = interval(b);
  return as < be && bs < ae;
}
function unique(values: readonly string[]): boolean { return new Set(values).size === values.length; }
function isoWeekday(utc: number): number { return ((new Date(utc).getUTCDay() + 6) % 7) + 1; }
function civil(utc: number): string { return new Date(utc).toISOString().slice(0, 10); }
function hhmm(minutes: number): string {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}
export function validateAcademicPeriods(periods: readonly AcademicPeriod[]): PlanningIssue[] {
  const issues: PlanningIssue[] = [];
  if (!unique(periods.map((p) => p.id)) || periods.some((p) => !p.id)) {
    issues.push({ code: "duplicate_period", message: "Identificadores dos períodos inválidos ou repetidos.", ids: [] });
  }
  for (const period of periods) {
    const start = parseCivilDate(period.startsOn);
    const end = parseCivilDate(period.endsOn);
    if (end < start) throw new Error("Período lectivo com fim anterior ao início.");
    if (!period.teachingDays.length || !unique(period.teachingDays.map(String)) ||
        period.teachingDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new Error("Dias lectivos do período inválidos.");
    }
  }
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      if (periods[i].startsOn <= periods[j].endsOn && periods[j].startsOn <= periods[i].endsOn) {
        issues.push({ code: "overlapping_periods", message: "Períodos lectivos sobrepostos.", ids: [periods[i].id, periods[j].id] });
      }
    }
  }
  return issues;
}
export function validateAcademicShift(shift: AcademicShift): PlanningIssue[] {
  const issues: PlanningIssue[] = [];
  const [entry, exit] = interval({ start: shift.entry, end: shift.exit });
  for (const [name, value] of [["antecedência de entrada", shift.gateEntryMinutesBefore],
    ["tolerância de saída", shift.gateExitMinutesAfter]] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 240) throw new Error(name + " inválida.");
  }
  if (entry - shift.gateEntryMinutesBefore < 0 || exit + shift.gateExitMinutesAfter >= 1440) {
    throw new Error("Janela de catraca ultrapassa o dia civil; divida o turno.");
  }
  const blocks = [...shift.lessons.map((v) => ({ ...v, kind: "lesson" })),
    ...shift.breaks.map((v) => ({ ...v, kind: "break" }))];
  if (!unique(blocks.map((b) => b.id)) || blocks.some((b) => !b.id)) {
    issues.push({ code: "duplicate_block", message: "Blocos do turno repetidos.", ids: [] });
  }
  for (const block of blocks) {
    const [start, end] = interval(block);
    if (start < entry || end > exit) {
      issues.push({ code: "outside_shift", message: "Aula ou intervalo fora do turno.", ids: [block.id] });
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (overlap(blocks[i], blocks[j])) {
        issues.push({ code: "overlapping_blocks", message: "Aulas e intervalos não podem sobrepor-se.", ids: [blocks[i].id, blocks[j].id] });
      }
    }
  }
  return issues;
}
export function gateWindows(shift: AcademicShift): { entry: TimeInterval; exit: TimeInterval } {
  const issues = validateAcademicShift(shift);
  if (issues.length) throw new Error("Corrija os conflitos do turno antes de activar a catraca.");
  const entry = parseLocalMinute(shift.entry);
  const exit = parseLocalMinute(shift.exit);
  return { entry: { start: hhmm(entry - shift.gateEntryMinutesBefore), end: shift.entry },
    exit: { start: shift.exit, end: hhmm(exit + shift.gateExitMinutesAfter) } };
}
export function planAcademicLessons(input: {
  periods: readonly AcademicPeriod[]; shifts: readonly AcademicShift[];
  lessons: readonly PlannedLesson[]; holidays?: readonly string[];
  excludedDates?: readonly string[]; extraTeachingDates?: readonly string[];
  /** Explicit recovery-day mapping: a Saturday can follow Monday's timetable.
   * Dates must be in the same academic period as their source weekday. */
  recoveryDays?: readonly { date: string; followsWeekday: number }[];
  maxOccurrences?: number;
}): PlanningResult {
  const issues = validateAcademicPeriods(input.periods);
  if (issues.length) return { issues, occurrences: [] };
  const shiftMap = new Map(input.shifts.map((s) => [s.id, s]));
  const periodMap = new Map(input.periods.map((p) => [p.id, p]));
  if (!unique(input.shifts.map((s) => s.id)) || input.shifts.some((s) => !s.id)) throw new Error("Turnos duplicados.");
  if (!unique(input.lessons.map((l) => l.id)) || input.lessons.some((l) => !l.id)) throw new Error("Aulas duplicadas.");
  for (const shift of input.shifts) issues.push(...validateAcademicShift(shift));
  if (issues.length) return { issues, occurrences: [] };
  const holidays = new Set(input.holidays ?? []);
  const excluded = new Set(input.excludedDates ?? []);
  const extra = new Set(input.extraTeachingDates ?? []);
  for (const date of [...holidays, ...excluded, ...extra]) parseCivilDate(date);
  if ([...extra].some((date) => holidays.has(date) || excluded.has(date))) {
    throw new Error("Dia extraordinário não pode ser feriado ou dia excluído.");
  }
  for (const date of extra) {
    if (!input.periods.some((p) => p.startsOn <= date && date <= p.endsOn)) {
      throw new Error("Dia lectivo extraordinário fora dos períodos configurados.");
    }
  }
  const recovery = new Map<string, number>();
  for (const replacement of input.recoveryDays ?? []) {
    parseCivilDate(replacement.date);
    if (!Number.isInteger(replacement.followsWeekday) || replacement.followsWeekday < 1 ||
        replacement.followsWeekday > 7 || recovery.has(replacement.date) ||
        holidays.has(replacement.date) || excluded.has(replacement.date) ||
        !input.periods.some((p) => p.startsOn <= replacement.date && replacement.date <= p.endsOn)) {
      throw new Error("Reposição lectiva inválida, repetida, excluída ou fora do período.");
    }
    recovery.set(replacement.date, replacement.followsWeekday);
  }
  if ([...recovery.keys()].some((date) => extra.has(date))) {
    throw new Error("Um dia não pode ter duas regras extraordinárias.");
  }
  const max = input.maxOccurrences ?? 10000;
  if (!Number.isSafeInteger(max) || max < 1 || max > 100000) throw new Error("Limite de ocorrências inválido.");
  const occurrences: LessonOccurrence[] = [];
  for (const lesson of input.lessons) {
    const period = periodMap.get(lesson.periodId);
    const shift = shiftMap.get(lesson.shiftId);
    if (!period || !shift || !Number.isInteger(lesson.weekday) || lesson.weekday < 1 || lesson.weekday > 7 ||
        !lesson.teacherId || !lesson.classGroupId) {
      issues.push({ code: "invalid_assignment", message: "Aula sem período, turno, dia, turma ou docente válido.", ids: [lesson.id] });
      continue;
    }
    const [start, end] = interval(lesson);
    const [entry, exit] = interval({ start: shift.entry, end: shift.exit });
    const matchesLessonBlock = shift.lessons.some((block) => {
      const [blockStart, blockEnd] = interval(block);
      return start >= blockStart && end <= blockEnd;
    });
    if (start < entry || end > exit || shift.breaks.some((b) => overlap(lesson, b)) ||
        !matchesLessonBlock) {
      issues.push({ code: "lesson_outside_teaching_window", message: "Aula fora de um bloco lectivo válido ou durante um intervalo.", ids: [lesson.id] });
      continue;
    }
    for (let day = parseCivilDate(period.startsOn); day <= parseCivilDate(period.endsOn); day += 86400000) {
      const date = civil(day);
      if (holidays.has(date) || excluded.has(date)) continue;
      const replacementWeekday = recovery.get(date);
      if ((replacementWeekday ?? isoWeekday(day)) !== lesson.weekday) continue;
      if (replacementWeekday === undefined && !extra.has(date) &&
          !period.teachingDays.includes(isoWeekday(day))) continue;
      if (occurrences.length >= max) throw new Error("Limite de aulas excedido; reduza o período.");
      occurrences.push({ ...lesson, date, startsAtLocal: date + "T" + lesson.start,
        endsAtLocal: date + "T" + lesson.end });
    }
  }
  occurrences.sort((a, b) => a.startsAtLocal.localeCompare(b.startsAtLocal) || a.id.localeCompare(b.id));
  for (let i = 0; i < occurrences.length; i++) {
    const a = occurrences[i];
    for (let j = i + 1; j < occurrences.length && occurrences[j].date === a.date; j++) {
      const b = occurrences[j];
      if (!overlap(a, b)) continue;
      if (a.classGroupId === b.classGroupId || a.teacherId === b.teacherId ||
          (a.roomId && b.roomId && a.roomId === b.roomId)) {
        issues.push({ code: "resource_collision", message: "Sobreposição de turma, docente ou sala na mesma data.", ids: [a.id, b.id] });
      }
    }
  }
  return { issues, occurrences: issues.length ? [] : occurrences };
}
