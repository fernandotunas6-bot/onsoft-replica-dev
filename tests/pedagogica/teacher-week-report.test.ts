import { describe, expect, it } from "vitest";
import {
  TEACHER_WEEK_CSV_COLUMNS,
  buildTeacherWeekReport,
  lessonHasStarted,
  weekLessonDates,
  type WeekLesson,
} from "@/features/pedagogica/teacher-week-report";

const now = { today: "2026-10-28", time: "10:00" };
const names = new Map([
  ["t-ana", "Ana Lopes"],
  ["t-rui", "Rui Neto"],
]);

function lesson(
  teacherId: string,
  date: string,
  startsAt: string,
  session: WeekLesson["session"] = null,
): WeekLesson {
  return { teacherId, date, startsAt, session };
}

describe("dias da semana para o resumo", () => {
  it("de segunda até hoje, sem feriados", () => {
    expect(
      weekLessonDates({
        monday: "2026-10-26",
        today: "2026-10-28",
        holidays: new Set(["2026-10-27"]),
      }),
    ).toEqual(["2026-10-26", "2026-10-28"]);
  });

  it("semana passada inteira", () => {
    expect(
      weekLessonDates({ monday: "2026-10-19", today: "2026-10-28", holidays: new Set() }),
    ).toHaveLength(7);
  });

  it("só conta a aula de hoje depois de começar", () => {
    expect(lessonHasStarted({ date: "2026-10-28", startsAt: "09:30:00" }, now)).toBe(true);
    expect(lessonHasStarted({ date: "2026-10-28", startsAt: "10:30:00" }, now)).toBe(false);
    expect(lessonHasStarted({ date: "2026-10-27", startsAt: "17:00:00" }, now)).toBe(true);
  });
});

describe("resumo semanal por professor", () => {
  const report = buildTeacherWeekReport({
    names,
    now,
    lessons: [
      lesson("t-ana", "2026-10-26", "08:00", {
        status: "completed",
        checkedInAt: "2026-10-26T07:02:00Z",
        method: "qr",
        lateMinutes: 2,
      }),
      lesson("t-ana", "2026-10-27", "08:00", {
        status: "pending",
        checkedInAt: "2026-10-27T07:20:00Z",
        method: "manual",
        lateMinutes: 20,
      }),
      // Rui fechou a chamada sem ler o QR: sinal de que não estava na sala.
      lesson("t-rui", "2026-10-26", "08:00", {
        status: "completed",
        checkedInAt: null,
        method: null,
        lateMinutes: null,
      }),
      lesson("t-rui", "2026-10-27", "08:00", null),
      lesson("t-rui", "2026-10-28", "09:00", {
        status: "pending",
        checkedInAt: "2026-10-28T08:01:00Z",
        method: "portal",
        lateMinutes: 1,
      }),
      // Ainda não começou: não conta.
      lesson("t-rui", "2026-10-28", "11:00", null),
    ],
    scans: [
      { teacherId: "t-rui", decision: "review" },
      { teacherId: "t-rui", decision: "rejected" },
    ],
  });

  it("conta aulas, presenças por método, atrasos e faltas", () => {
    const ana = report.rows.find((row) => row.teacherId === "t-ana")!;
    expect(ana).toMatchObject({
      scheduled: 2,
      confirmed: 2,
      byQr: 1,
      byDirection: 1,
      late: 1,
      missing: 0,
      rate: 100,
    });
    const rui = report.rows.find((row) => row.teacherId === "t-rui")!;
    expect(rui).toMatchObject({
      scheduled: 3,
      confirmed: 1,
      bySelf: 1,
      missing: 2,
      callsWithoutPresence: 1,
      scansInReview: 1,
      scansRejected: 1,
      rate: 33,
    });
  });

  it("quem tem chamadas sem presença aparece primeiro", () => {
    expect(report.rows.map((row) => row.teacherName)).toEqual(["Rui Neto", "Ana Lopes"]);
  });

  it("totais da escola", () => {
    expect(report.totals).toMatchObject({ scheduled: 5, confirmed: 3, missing: 2, rate: 60 });
  });

  it("CSV com uma coluna por número", () => {
    const rui = report.rows[0];
    expect(TEACHER_WEEK_CSV_COLUMNS.map((column) => column.value(rui))).toEqual([
      "Rui Neto",
      3,
      1,
      0,
      1,
      0,
      0,
      2,
      1,
      1,
      1,
      33,
    ]);
  });
});
