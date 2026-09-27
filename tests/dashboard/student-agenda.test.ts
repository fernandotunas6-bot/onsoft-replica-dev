import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  groupTimetableByDay,
  pickNextLesson,
  type StudentAgendaSlot,
} from "@/features/dashboard/student-agenda";

const slot = (weekday: number, startsAt: string, endsAt: string, subjectName: string) =>
  ({ weekday, startsAt, endsAt, subjectName }) satisfies StudentAgendaSlot;

describe("pickNextLesson", () => {
  const slots = [
    slot(1, "08:00:00", "08:45:00", "Matemática"),
    slot(1, "10:00:00", "10:45:00", "Física"),
    slot(3, "07:30:00", "08:15:00", "Química"),
  ];

  it("escolhe a aula de hoje que ainda não terminou", () => {
    expect(pickNextLesson(slots, 1, "09:10")).toMatchObject({
      subjectName: "Física",
      daysAhead: 0,
    });
  });

  it("uma aula a decorrer ainda conta como próxima", () => {
    expect(pickNextLesson(slots, 1, "08:30")).toMatchObject({ subjectName: "Matemática" });
  });

  it("passa para o dia seguinte com aulas quando hoje já acabaram", () => {
    expect(pickNextLesson(slots, 1, "11:00")).toMatchObject({
      subjectName: "Química",
      daysAhead: 2,
    });
  });

  it("dá a volta à semana", () => {
    expect(pickNextLesson(slots, 5, "12:00")).toMatchObject({
      subjectName: "Matemática",
      daysAhead: 3,
    });
  });

  it("sem horário não inventa aula", () => {
    expect(pickNextLesson([], 1, "08:00")).toBeNull();
  });
});

describe.each([
  "src/features/dashboard/portals/StudentPortalDashboard.tsx",
  "src/features/dashboard/portals/GuardianPortalDashboard.tsx",
  "src/features/dashboard/portals/TeacherPortalDashboard.tsx",
  "src/features/catracas/components/VirtualCardModal.tsx",
  "src/features/pedagogica/components/AttendanceWorkspaceModule.tsx",
])("%s", (file) => {
  const source = readFileSync(file, "utf8");

  it("não mostra valores fixos como se fossem dados do aluno", () => {
    for (const fake of [
      '"14.7"',
      "Física · Prova",
      ">Matemática<",
      "10ª Classe · Turma A",
      "Situação Académica Positiva",
      "Prova marcada para",
      "rate: 94",
      "rate: 100",
      '|| "08:00"',
      "31/12/${",
    ]) {
      expect(source).not.toContain(fake);
    }
  });
});

describe("groupTimetableByDay", () => {
  const lesson = (weekday: number, startsAt: string, subjectName: string) => ({
    weekday,
    startsAt,
    endsAt: "23:59",
    subjectName,
    teacherName: null,
    room: null,
  });

  it("agrupa por dia, segunda primeiro, e ordena por hora", () => {
    const days = groupTimetableByDay([
      lesson(3, "10:00", "Física"),
      lesson(1, "10:00", "Química"),
      lesson(1, "07:30", "Português"),
      lesson(6, "08:00", "Educação Física"),
    ]);
    expect(days.map((d) => d.weekday)).toEqual([1, 3, 6]);
    expect(days[0]!.lessons.map((l) => l.subjectName)).toEqual(["Português", "Química"]);
  });

  it("domingo vai para o fim e dias inválidos são ignorados", () => {
    const days = groupTimetableByDay([
      lesson(0, "09:00", "A"),
      lesson(2, "09:00", "B"),
      lesson(9, "09:00", "C"),
    ]);
    expect(days.map((d) => d.weekday)).toEqual([2, 0]);
  });
});
