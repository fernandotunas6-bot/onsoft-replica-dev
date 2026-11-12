import { describe, expect, it } from "vitest";
import type { AgendaEvent } from "@/features/calendar/agenda";
import {
  academicAgendaWeek,
  groupTimetableByDay,
  studentUpcomingFromAcademicAgenda,
  timetableFromAcademicAgenda,
} from "@/features/calendar/portal-agenda";

function lesson(day: string, startsAt = "08:00", endsAt = "08:45"): AgendaEvent {
  return {
    id: `lesson:slot@${day}`,
    title: "Matemática · A",
    start: `${day}T${startsAt}:00+01:00`,
    end: `${day}T${endsAt}:00+01:00`,
    allDay: false,
    editable: false,
    extendedProps: {
      source: "lesson",
      sourceId: `slot@${day}`,
      category: "lesson",
      subjectName: "Matemática",
      classGroupName: "A",
      teacherName: "Docente",
      room: "Laboratório",
      publishedAt: "2026-10-24T12:00:00Z",
    },
  };
}
function assessment(day: string, id = "exam"): AgendaEvent {
  return {
    id,
    title: "Prova",
    start: day,
    end: `${day}T23:59:59+01:00`,
    allDay: true,
    editable: false,
    extendedProps: {
      source: "assessment",
      sourceId: id,
      category: "assessment",
      subjectName: "Física",
      assessmentKind: "npp",
    },
  };
}

describe("projecções dos portais sobre a agenda publicada", () => {
  it("calcula a semana civil em viragens de mês, ano e no domingo", () => {
    expect(academicAgendaWeek("2026-11-01")).toEqual({ start: "2026-10-26", end: "2026-11-02" });
    expect(academicAgendaWeek("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-04" });
    expect(academicAgendaWeek("2026-10-26")).toEqual({ start: "2026-10-26", end: "2026-11-02" });
  });

  it("preserva identificador, sala, docente e publicação; domingo não desaparece", () => {
    const week = academicAgendaWeek("2026-10-26");
    expect(
      timetableFromAcademicAgenda(
        [
          lesson("2026-11-02"),
          lesson("2026-11-01"),
          assessment("2026-10-27"),
          lesson("2026-10-25"),
          lesson("2026-10-26"),
        ],
        week,
        "A",
      ),
    ).toEqual({
      className: "A",
      publishedAt: "2026-10-24T12:00:00Z",
      weekStart: week.start,
      days: [1, 0].map((weekday) => ({
        weekday,
        lessons: [
          {
            slotId: "slot",
            startsAt: "08:00",
            endsAt: "08:45",
            subjectName: "Matemática",
            teacherName: "Docente",
            className: "A",
            room: "Laboratório",
          },
        ],
      })),
    });
  });

  it("normaliza domingo=7 no contrato existente sem aceitar dias inválidos", () => {
    const base = {
      startsAt: "08:00",
      endsAt: "09:00",
      subjectName: "A",
      teacherName: null,
      room: null,
    };
    expect(
      groupTimetableByDay([7, 1, 9, -1].map((weekday) => ({ ...base, weekday }))).map(
        (d) => d.weekday,
      ),
    ).toEqual([1, 0]);
  });

  it("não repete uma aula semanal durante férias: usa a data real de regresso", () => {
    const result = studentUpcomingFromAcademicAgenda([lesson("2026-11-09")], "2026-10-26", "12:00");
    expect(result.nextLesson).toMatchObject({ daysAhead: 14, weekday: 1, startsAt: "08:00" });
    expect(studentUpcomingFromAcademicAgenda([], "2026-10-26", "12:00").nextLesson).toBeNull();
  });

  it("mantém a aula em curso e passa à ocorrência seguinte na hora exacta de fim", () => {
    const events = [lesson("2026-10-26"), lesson("2026-11-01")];
    expect(
      studentUpcomingFromAcademicAgenda(events, "2026-10-26", "08:15").nextLesson?.daysAhead,
    ).toBe(0);
    expect(
      studentUpcomingFromAcademicAgenda(events, "2026-10-26", "08:45").nextLesson,
    ).toMatchObject({ daysAhead: 6, weekday: 0 });
  });

  it("avaliações respeitam o fim em UTC e mantêm as do dia sem hora", () => {
    const exam = {
      ...assessment("2026-10-26", "timed"),
      allDay: false,
      start: "2026-10-26T08:00:00+01:00",
      end: "2026-10-26T08:30:00.000Z",
    };
    const untimed = assessment("2026-10-26", "untimed");
    const events = [exam, untimed];
    expect(
      studentUpcomingFromAcademicAgenda(events, "2026-10-26", "09:29").upcomingAssessments,
    ).toHaveLength(2);
    expect(
      studentUpcomingFromAcademicAgenda(events, "2026-10-26", "09:30").upcomingAssessments,
    ).toEqual([{ name: "Prova", subjectName: "Física", date: "2026-10-26", kind: "npp" }]);
  });

  it("ordena e limita avaliações depois de excluir as que terminaram", () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      assessment(`2026-11-${String(i + 1).padStart(2, "0")}`, `exam-${i}`),
    ).reverse();
    events.push(assessment("2026-10-25"));
    const result = studentUpcomingFromAcademicAgenda(events, "2026-10-26", "08:00");
    expect(result.upcomingAssessments).toHaveLength(8);
    expect(result.nextAssessment?.date).toBe("2026-11-01");
    expect(result.upcomingAssessments.at(-1)?.date).toBe("2026-11-08");
    expect(events[0].id).toBe("exam-11");
  });
});
