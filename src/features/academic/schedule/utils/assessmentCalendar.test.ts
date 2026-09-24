import { describe, expect, it } from "vitest";
import { validateAssessmentCalendar, type AssessmentSession, type AssessmentWindow } from "./assessmentCalendar";
const periods = [{ id: "t1", startsOn: "2026-09-01", endsOn: "2026-12-31" }];
const windows: AssessmentWindow[] = [{ id: "test1", periodId: "t1", kind: "trimester_test",
  startsOn: "2026-12-01", endsOn: "2026-12-15", allowedGrades: [9] }];
const session: AssessmentSession = { id: "s1", windowId: "test1", date: "2026-12-03",
  startsAt: "08:00", endsAt: "09:30", classGroupId: "9A", subjectId: "math",
  roomId: "room1", invigilatorIds: ["teacher1"], grade: 9 };
describe("calendário de provas e exames", () => {
  it("aceita uma sessão dentro da janela", () => {
    expect(validateAssessmentCalendar({ periods, windows, sessions: [session] })).toEqual([]);
  });
  it("rejeita sessões em feriados e fora da janela", () => {
    expect(validateAssessmentCalendar({ periods, windows, sessions: [session],
      blockedDates: ["2026-12-03"] }).some((x) => x.code === "invalid_session_date")).toBe(true);
    expect(validateAssessmentCalendar({ periods, windows,
      sessions: [{ ...session, date: "2026-11-30" }] }).some((x) => x.code === "invalid_session_date")).toBe(true);
  });
  it("detecta choques de turma, sala e vigilante", () => {
    const second = { ...session, id: "s2", classGroupId: "9B", subjectId: "portuguese" };
    expect(validateAssessmentCalendar({ periods, windows, sessions: [session, second] })
      .some((x) => x.code === "assessment_collision")).toBe(true);
  });
  it("limita as provas diárias por turma", () => {
    const sessions = [session, { ...session, id: "s2", startsAt: "10:00", endsAt: "11:00",
      roomId: "room2", invigilatorIds: ["teacher2"] }, { ...session, id: "s3",
      startsAt: "12:00", endsAt: "13:00", roomId: "room3", invigilatorIds: ["teacher3"] }];
    expect(validateAssessmentCalendar({ periods, windows, sessions })
      .some((x) => x.code === "daily_exam_limit")).toBe(true);
  });
  it("não assume elegibilidade nacional sem regras oficiais versionadas", () => {
    const national: AssessmentWindow = { ...windows[0], kind: "national_exam" };
    expect(validateAssessmentCalendar({ periods, windows: [national], sessions: [] })
      .some((issue) => issue.code === "national_exam_grade")).toBe(true);
  });
  it("bloqueia exames sobre aulas publicadas da turma, sala ou vigilante", () => {
    const teachingSlots = [{ id: "lesson1", date: "2026-12-03", startsAt: "08:45",
      endsAt: "09:15", classGroupId: "9B", roomId: "room2", teacherId: "teacher1" }];
    expect(validateAssessmentCalendar({ periods, windows, sessions: [session], teachingSlots })
      .some((issue) => issue.code === "exam_lesson_collision")).toBe(true);
    expect(validateAssessmentCalendar({ periods, windows, sessions: [session],
      teachingSlots: [{ ...teachingSlots[0], startsAt: "09:30", endsAt: "10:00" }] })
      .some((issue) => issue.code === "exam_lesson_collision")).toBe(false);
  });
  it("bloqueia classes não elegíveis para exame nacional", () => {
    const national: AssessmentWindow = { ...windows[0], kind: "national_exam", allowedGrades: [7] };
    expect(validateAssessmentCalendar({ periods, windows: [national], sessions: [], nationalExamGrades: [6, 9, 12] })
      .some((x) => x.code === "national_exam_grade")).toBe(true);
  });
});