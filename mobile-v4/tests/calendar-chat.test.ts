import { it, expect } from "vitest";
import { seed, DemoGateway } from "../src/services/demo";
import {
  summaryForDay,
  daysOfMonth,
  calendarStats,
  luandaDate,
  yearDays,
} from "../src/domain/calendar";
import { scopeWorkspace } from "../src/domain/policy";
import { importSigaDirectMessages } from "../src/services/chat-import";
import type { Context } from "../src/domain/model";
const student: Context = { userId: "demo-student", schoolId: "demo-a", role: "aluno" };
const teacher: Context = { userId: "demo-teacher", schoolId: "demo-a", role: "professor" };
it("Luanda dates cross midnight correctly", () =>
  expect(luandaDate(new Date("2026-10-09T23:30:00Z"))).toBe("2026-10-10"));
it("February has correct leap day and annual grid length", () => {
  expect(daysOfMonth("2024-02")).toHaveLength(29);
  expect(daysOfMonth("2026-02")).toHaveLength(28);
  expect(yearDays(2024)).toHaveLength(366);
});
it("unrecorded scheduled lesson never becomes absence", () => {
  const d = seed("demo-a");
  const s = summaryForDay(d, student, d.lessons[0].date);
  expect(s.status).toBe("pendente");
  expect(s.absent).toBe(0);
  expect(summaryForDay(d, student, "2000-01-01").status).toBe("sem-aulas");
});
it("blue presence and red absence refer only to own student", () => {
  const d = seed("demo-a");
  const date = d.lessons[0].date;
  d.attendance.push({ lessonId: d.lessons[0].id, studentId: "demo-a-s2", status: "ausente" });
  expect(summaryForDay(d, student, date).status).toBe("pendente");
  d.attendance.push({ lessonId: d.lessons[0].id, studentId: "demo-a-s1", status: "presente" });
  expect(summaryForDay(d, student, date).status).toBe("presente");
});
it("teacher attendance is separate from student roll call", () => {
  const d = seed("demo-a");
  d.attendance.push({ lessonId: d.lessons[0].id, studentId: "demo-a-s1", status: "ausente" });
  expect(summaryForDay(d, teacher, d.lessons[0].date).status).toBe("pendente");
  d.teacherAttendance = [{ lessonId: d.lessons[0].id, userId: teacher.userId, status: "presente" }];
  expect(summaryForDay(d, teacher, d.lessons[0].date).status).toBe("presente");
});
it("handles mixed days and counts lessons rather than calendar cells", () => {
  const d = seed("demo-a");
  d.lessons.push({ ...d.lessons[0], id: "second" });
  d.attendance.push(
    { lessonId: d.lessons[0].id, studentId: "demo-a-s1", status: "presente" },
    { lessonId: "second", studentId: "demo-a-s1", status: "ausente" },
  );
  expect(summaryForDay(d, student, d.lessons[0].date).status).toBe("misto");
  expect(calendarStats(d, student, [d.lessons[0].date])).toEqual({
    present: 1,
    absent: 1,
    justified: 0,
    activeDays: 1,
    total: 2,
  });
});
it("rejects school mismatch and hides teacher records from students", () => {
  expect(() => summaryForDay(seed("demo-b"), student, "2026-10-09")).toThrow();
  const d = seed("demo-a");
  d.teacherAttendance = [{ lessonId: d.lessons[0].id, userId: "demo-teacher", status: "presente" }];
  expect(scopeWorkspace(d, student).teacherAttendance).toHaveLength(0);
});
it("explicit demo includes coloured calendar examples", async () => {
  const g = new DemoGateway("professor", true);
  const d = await g.workspace(teacher);
  expect(d.teacherAttendance?.some((a) => a.status === "ausente")).toBe(true);
  expect((await g.session())?.mode).toBe("demo");
});
const thread = {
  schoolId: "demo-a",
  memberIds: ["demo-teacher", "demo-student"],
  messages: [
    { id: "m1", sender_id: "demo-teacher", body: "Olá", created_at: "2026-10-09T10:00:00Z" },
  ],
};
it("imports authorised SIGA message projection into chat bubbles", () =>
  expect(importSigaDirectMessages(student, [thread])[0]).toMatchObject({
    from: "demo-teacher",
    to: "demo-student",
    text: "Olá",
  }));
it("rejects chat from another school, group or unauthorised participant", () => {
  expect(() => importSigaDirectMessages(student, [{ ...thread, schoolId: "demo-b" }])).toThrow();
  expect(() =>
    importSigaDirectMessages(student, [{ ...thread, memberIds: ["other", "someone"] }]),
  ).toThrow();
  expect(() =>
    importSigaDirectMessages(student, [
      { ...thread, messages: [{ ...thread.messages[0], sender_id: "outsider" }] },
    ]),
  ).toThrow();
});
it("omits deleted messages and deduplicates imported records", () => {
  expect(
    importSigaDirectMessages(student, [
      { ...thread, messages: [...thread.messages, ...thread.messages] },
    ]),
  ).toHaveLength(1);
  expect(
    importSigaDirectMessages(student, [
      { ...thread, messages: [{ ...thread.messages[0], deleted_at: "2026-10-09" }] },
    ]),
  ).toHaveLength(0);
});
it("rejects invalid imported timestamp", () =>
  expect(() =>
    importSigaDirectMessages(student, [
      { ...thread, messages: [{ ...thread.messages[0], created_at: "invalid" }] },
    ]),
  ).toThrow());
