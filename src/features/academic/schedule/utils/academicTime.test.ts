import { describe, expect, it } from "vitest";
import {
  gateWindows, parseCivilDate, parseLocalMinute, planAcademicLessons,
  validateAcademicPeriods, validateAcademicShift,
  type AcademicPeriod, type AcademicShift, type PlannedLesson,
} from "./academicTime";

const period: AcademicPeriod = {
  id: "p1", name: "Primeiro trimestre", startsOn: "2026-09-21", endsOn: "2026-09-27",
  teachingDays: [1, 2, 3, 4, 5],
};
const shift: AcademicShift = {
  id: "morning", name: "Manhã", entry: "07:30", exit: "12:30",
  gateEntryMinutesBefore: 30, gateExitMinutesAfter: 15,
  lessons: [
    { id: "block1", start: "08:00", end: "09:00" },
    { id: "block2", start: "09:00", end: "10:00" },
    { id: "block3", start: "10:20", end: "11:20" },
  ],
  breaks: [{ id: "break1", name: "Intervalo", start: "10:00", end: "10:20" }],
};
const lesson: PlannedLesson = {
  id: "lesson-1", periodId: "p1", shiftId: "morning", weekday: 1,
  start: "08:00", end: "09:00", teacherId: "teacher-1", classGroupId: "class-1", roomId: "room-1",
};
describe("períodos lectivos, turnos, intervalos e catracas", () => {
  it("valida datas reais e minutos inteiros", () => {
    expect(parseCivilDate("2026-09-24")).toBeGreaterThan(0);
    expect(() => parseCivilDate("2026-02-30")).toThrow();
    expect(parseLocalMinute("09:30:00")).toBe(570);
    expect(() => parseLocalMinute("09:30:20")).toThrow();
    expect(() => parseLocalMinute("24:00")).toThrow();
  });
  it("aceita aulas consecutivas e separa intervalos", () => {
    expect(validateAcademicShift(shift)).toEqual([]);
    expect(gateWindows(shift)).toEqual({
      entry: { start: "07:00", end: "07:30" },
      exit: { start: "12:30", end: "12:45" },
    });
  });
  it("bloqueia aula durante o intervalo e intervalos sobrepostos", () => {
    expect(validateAcademicShift({
      ...shift, breaks: [{ id: "break1", name: "Intervalo", start: "08:50", end: "09:10" }],
    }).some((issue) => issue.code === "overlapping_blocks")).toBe(true);
    expect(planAcademicLessons({ periods: [period], shifts: [shift],
      lessons: [{ ...lesson, start: "09:50", end: "10:30" }] }).issues
      .some((issue) => issue.code === "lesson_outside_teaching_window")).toBe(true);
  });
  it("rejeita períodos sobrepostos e turnos com catracas fora do dia", () => {
    expect(validateAcademicPeriods([period, { ...period, id: "p2", startsOn: "2026-09-25", endsOn: "2026-10-01" }])
      .some((issue) => issue.code === "overlapping_periods")).toBe(true);
    expect(() => validateAcademicShift({ ...shift, entry: "00:10", gateEntryMinutesBefore: 30 })).toThrow();
  });
  it("expande apenas as datas previstas, excluindo feriados", () => {
    const result = planAcademicLessons({ periods: [period], shifts: [shift], lessons: [lesson] });
    expect(result.issues).toEqual([]);
    expect(result.occurrences.map((item) => item.date)).toEqual(["2026-09-21"]);
    const holiday = planAcademicLessons({ periods: [period], shifts: [shift],
      lessons: [lesson], holidays: ["2026-09-21"] });
    expect(holiday.occurrences).toEqual([]);
  });
  it("não replica todas as aulas em dias extraordinários", () => {
    const result = planAcademicLessons({ periods: [period], shifts: [shift],
      lessons: [lesson], extraTeachingDates: ["2026-09-26"] });
    expect(result.occurrences.map((item) => item.date)).toEqual(["2026-09-21"]);
  });
  it("detecta conflito real por docente, turma ou sala na mesma data", () => {
    const result = planAcademicLessons({ periods: [period], shifts: [shift],
      lessons: [lesson, { ...lesson, id: "lesson-2", classGroupId: "class-2", roomId: "room-2" }] });
    expect(result.issues.some((issue) => issue.code === "resource_collision")).toBe(true);
    expect(result.occurrences).toEqual([]);
  });
  it("não cria conflitos entre aulas consecutivas", () => {
    const result = planAcademicLessons({ periods: [period], shifts: [shift],
      lessons: [lesson, { ...lesson, id: "lesson-2", start: "09:00", end: "10:00" }] });
    expect(result.issues).toEqual([]);
    expect(result.occurrences).toHaveLength(2);
  });
});
