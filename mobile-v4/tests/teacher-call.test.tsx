import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AcademicCatalog } from "../src/domain/catalog";
import type { Context, Gateway } from "../src/domain/model";
import { parseTeacherDay, type TeacherDay } from "../src/domain/teacher-day";
import { TeacherCall } from "../src/components/TeacherCall";
import { ApiError, ApiGateway } from "../src/services/api";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const teacher: Context = { schoolId: id(1), userId: id(3), role: "professor" };
function catalog(): AcademicCatalog {
  return {
    schoolId: teacher.schoolId,
    role: "professor",
    classes: [
      {
        classSubjectId: id(4),
        classGroupId: id(5),
        academicYearId: id(6),
        subjectId: id(7),
        className: "10.ª A",
        subjectName: "Matemática",
        teacher: { id: id(8), userId: teacher.userId, name: "Docente" },
        students: [
          { studentId: id(9), userId: null, enrollmentId: id(10), name: "Ana" },
          { studentId: id(11), userId: null, enrollmentId: id(12), name: "Bruno" },
        ],
      },
    ],
    timetable: [],
    tasks: [],
  };
}
function raw() {
  return {
    schoolId: teacher.schoolId,
    date: "2026-10-10",
    lessons: [
      {
        sessionId: id(20),
        classSubjectId: id(4),
        startsAt: "08:00",
        endsAt: "08:45",
        room: null,
        status: "pending",
        records: [{ studentId: id(9), status: "late" }],
      },
    ],
  };
}
const day = (): TeacherDay => parseTeacherDay(raw(), teacher, catalog());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("contrato das aulas de hoje", () => {
  it("aceita a resposta do servidor e esquece marcações de quem saiu da turma", () => {
    const data = raw();
    data.lessons[0].records.push({ studentId: id(99), status: "absent" });
    expect(parseTeacherDay(data, teacher, catalog()).lessons[0].records).toEqual([
      { studentId: id(9), status: "late" },
    ]);
  });
  it.each(["school", "class", "duplicate", "status", "session", "record", "role"])(
    "recusa %s fora do âmbito",
    (kind) => {
      const data = raw() as ReturnType<typeof raw> & { lessons: Record<string, unknown>[] };
      let ctx = teacher;
      if (kind === "school") data.schoolId = id(30);
      if (kind === "class") data.lessons[0].classSubjectId = id(30);
      if (kind === "duplicate") data.lessons.push(data.lessons[0]);
      if (kind === "status") data.lessons[0].status = "draft";
      if (kind === "session") data.lessons[0].sessionId = "lesson-1";
      if (kind === "record") data.lessons[0].records = [{ studentId: id(9), status: "maybe" }];
      if (kind === "role") ctx = { ...teacher, role: "aluno" };
      expect(() => parseTeacherDay(data, ctx, catalog())).toThrow("Contrato das aulas de hoje");
    },
  );
});

describe("gateway da chamada", () => {
  const session = {
    userId: teacher.userId,
    name: "Docente",
    memberships: [
      {
        schoolId: teacher.schoolId,
        schoolName: "Escola",
        active: true,
        roles: ["professor"],
        permissions: ["academic.read", "attendance.write"],
      },
    ],
  };
  function gatewayWith(responses: Response[]) {
    const fetch = vi.fn();
    for (const response of responses) fetch.mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetch);
    return { fetch, api: new ApiGateway("/api/mobile-v4", { accessToken: async () => "jwt" }) };
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("lê as aulas de hoje e fecha a chamada com o mesmo requestId ao repetir", async () => {
    const { fetch, api } = gatewayWith([
      json(session),
      json(raw()),
      json({ error: "INTERNAL_ERROR" }, 500),
      json({ ok: true }),
    ]);
    await api.session();
    const today = await api.teacherDay(teacher, catalog());
    expect(fetch.mock.calls[1][0]).toBe(
      `/api/mobile-v4/schools/${teacher.schoolId}/lessons?role=professor`,
    );
    const entries = [
      { studentId: id(9), status: "presente" as const },
      { studentId: id(11), status: "ausente" as const },
    ];
    await expect(
      api.recordAttendance(teacher, catalog(), today, id(20), entries),
    ).rejects.toThrow();
    await api.recordAttendance(teacher, catalog(), today, id(20), entries);
    const first = JSON.parse(fetch.mock.calls[2][1].body);
    const retry = JSON.parse(fetch.mock.calls[3][1].body);
    expect(first).toMatchObject({
      role: "professor",
      command: { type: "attendance", lessonId: id(20), entries },
    });
    expect(retry.requestId).toBe(first.requestId);
    expect(fetch.mock.calls[3][0]).toBe(`/api/mobile-v4/schools/${teacher.schoolId}/commands`);
  });

  it("não envia alunos de fora, repetidos ou aulas fechadas", async () => {
    const { fetch, api } = gatewayWith([json(session)]);
    await api.session();
    const today = day();
    await expect(
      api.recordAttendance(teacher, catalog(), today, id(20), [
        { studentId: id(99), status: "presente" },
      ]),
    ).rejects.toThrow("alunos desta turma");
    await expect(
      api.recordAttendance(teacher, catalog(), today, id(20), [
        { studentId: id(9), status: "presente" },
        { studentId: id(9), status: "ausente" },
      ]),
    ).rejects.toThrow("alunos desta turma");
    today.lessons[0].status = "completed";
    await expect(
      api.recordAttendance(teacher, catalog(), today, id(20), [
        { studentId: id(9), status: "presente" },
      ]),
    ).rejects.toThrow("já não está aberta");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("ecrã da chamada", () => {
  function fakeGateway(record: Gateway["recordAttendance"]): Gateway {
    return {
      session: vi.fn(),
      workspace: vi.fn(),
      execute: vi.fn(),
      signOut: vi.fn(),
      teacherDay: vi.fn().mockResolvedValue(day()),
      recordAttendance: record,
    };
  }

  it("marca todos, grava e volta a ler as aulas", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const gateway = fakeGateway(record);
    const saved = vi.fn();
    render(<TeacherCall catalog={catalog()} ctx={teacher} gateway={gateway} onSaved={saved} />);
    fireEvent.click(await screen.findByRole("button", { name: "Fazer chamada" }));
    // O atraso já gravado aparece como presente; falta marcar o Bruno.
    expect(screen.getByText("Falta marcar 1 aluno(s).")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Fechar chamada" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Todos presentes" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar chamada" }));
    await screen.findByText("Chamada gravada e fechada.");
    expect(record).toHaveBeenCalledWith(teacher, catalog(), day(), id(20), [
      { studentId: id(9), status: "presente" },
      { studentId: id(11), status: "presente" },
    ]);
    expect(saved).toHaveBeenCalled();
    await waitFor(() => expect(gateway.teacherDay).toHaveBeenCalledTimes(2));
  });

  it("chamada já fechada ou pauta oficial remete para o portal", async () => {
    const gateway = fakeGateway(vi.fn().mockRejectedValue(new ApiError(409, "conflito")));
    render(<TeacherCall catalog={catalog()} ctx={teacher} gateway={gateway} />);
    fireEvent.click(await screen.findByRole("button", { name: "Fazer chamada" }));
    fireEvent.click(screen.getByRole("button", { name: "Todos presentes" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar chamada" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Corrige-a no portal");
  });
});
