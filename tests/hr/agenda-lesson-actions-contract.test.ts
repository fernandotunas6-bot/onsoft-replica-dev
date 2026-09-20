import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  agendaLessonActions,
  teacherAttendanceCallSearch,
  teacherQrPresenceSearch,
} from "@/features/hr/teacher-classroom-links";

const root = resolve(import.meta.dirname, "../..");
const turma = "11111111-1111-1111-1111-111111111111";
const disciplina = "22222222-2222-2222-2222-222222222222";

describe("agenda lesson → chamada / QR", () => {
  it("builds pedagogica deep-link for attendance call", () => {
    const search = teacherAttendanceCallSearch(turma, disciplina);
    expect(search).toEqual({
      tab: "chamada",
      turma,
      disciplina,
    });
  });

  it("includes dia when a lesson date is provided for the call", () => {
    expect(teacherAttendanceCallSearch(turma, disciplina, "2026-09-07")).toEqual({
      tab: "chamada",
      turma,
      disciplina,
      dia: "2026-09-07",
    });
  });

  it("builds QR presence deep-link with turma, disciplina and optional data", () => {
    expect(teacherQrPresenceSearch(turma, disciplina)).toEqual({
      turma,
      disciplina,
    });
    expect(teacherQrPresenceSearch(turma, disciplina, "2026-09-07")).toEqual({
      turma,
      disciplina,
      data: "2026-09-07",
    });
  });

  it("returns null when the lesson lacks turma or disciplina", () => {
    expect(agendaLessonActions({ classGroupId: null, subjectId: disciplina })).toBeNull();
  });

  it("exposes call, grades and qr searches when ids exist", () => {
    const actions = agendaLessonActions({
      classGroupId: turma,
      subjectId: disciplina,
      date: "2026-09-07",
    });
    expect(actions?.callSearch.tab).toBe("chamada");
    expect(actions?.callSearch.dia).toBe("2026-09-07");
    expect(actions?.gradesSearch.tab).toBe("notas");
    expect(actions?.gradesSearch.pauta).toBe("1");
    expect(actions?.qrSearch).toEqual({
      turma,
      disciplina,
      data: "2026-09-07",
    });
  });

  it("wires contextual CTAs in TopbarCalendar, calendário and presence panel", () => {
    const topbar = readFileSync(resolve(root, "src/components/layout/TopbarCalendar.tsx"), "utf8");
    expect(topbar).toContain("agendaLessonActions");
    expect(topbar).toContain("actions.qrSearch");
    expect(topbar).toContain("Chamada");

    const calendario = readFileSync(resolve(root, "src/routes/calendario.tsx"), "utf8");
    expect(calendario).toContain("actions.qrSearch");
    expect(calendario).toContain("date: selectedDay");

    const attendance = readFileSync(
      resolve(root, "src/features/pedagogica/components/AttendanceWorkspaceModule.tsx"),
      "utf8",
    );
    expect(attendance).toContain("initialClassGroupId");
    expect(attendance).toContain("initialDate");
    expect(attendance).toContain("draftCall");
    expect(attendance).toContain("autoOpenedRef");

    const panel = readFileSync(resolve(root, "src/features/hr/TeacherAttendancePanel.tsx"), "utf8");
    expect(panel).toContain("focusLesson");
    expect(panel).toContain("Aula da agenda");

    const presenceRoute = readFileSync(resolve(root, "src/routes/professor.presenca.tsx"), "utf8");
    expect(presenceRoute).toContain("focusLesson");

    const pedagogica = readFileSync(resolve(root, "src/routes/pedagogica.tsx"), "utf8");
    expect(pedagogica).toContain("dia:");
    expect(pedagogica).toContain("initialDate={diaFromSearch}");
  });
});
