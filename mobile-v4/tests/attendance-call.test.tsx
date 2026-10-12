import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AttendanceCall, callableClasses } from "../src/components/AttendanceCall";
import { parseAttendanceCallReceipt, type AcademicAttendance } from "../src/domain/attendance";
import type { AcademicCatalog } from "../src/domain/catalog";
import type { Context, Gateway } from "../src/domain/model";
import { ApiError } from "../src/services/api";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx: Context = { userId: id(1), schoolId: id(2), role: "professor" };
// 2026-10-09 é sexta-feira (dia 5 na semana ISO).
const DAY = "2026-10-09";
const klass = (cs: number, students: number[]) => ({
  classSubjectId: id(cs),
  classGroupId: id(cs + 100),
  academicYearId: id(300),
  className: `10.ª ${cs}`,
  subjectName: `Disciplina ${cs}`,
  subjectId: id(cs + 200),
  teacher: { id: id(400), name: "Professor", userId: ctx.userId },
  students: students.map((n) => ({
    studentId: id(n),
    enrollmentId: id(n + 1000),
    name: `Aluno ${n}`,
    userId: null,
  })),
});
const catalog = (): AcademicCatalog => ({
  schoolId: ctx.schoolId,
  role: "professor",
  classes: [klass(10, [50, 51]), klass(11, [52]), klass(12, [53]), klass(13, []), klass(14, [54])],
  timetable: [
    // Sexta, em vigor.
    {
      slotId: id(500),
      classSubjectId: id(10),
      scheduleId: null,
      publication: "published",
      validFrom: "2026-09-01",
      validTo: null,
      weekday: 5,
      startsAt: "08:00",
      endsAt: "08:45",
      room: null,
    },
    // Sexta, mas o horário só começa depois.
    {
      slotId: id(501),
      classSubjectId: id(11),
      scheduleId: null,
      publication: "published",
      validFrom: "2026-11-01",
      validTo: null,
      weekday: 5,
      startsAt: "09:00",
      endsAt: "09:45",
      room: null,
    },
    // Sexta, turma sem alunos.
    {
      slotId: id(502),
      classSubjectId: id(13),
      scheduleId: null,
      publication: "published",
      validFrom: null,
      validTo: null,
      weekday: 5,
      startsAt: "10:00",
      endsAt: "10:45",
      room: null,
    },
    // Segunda.
    {
      slotId: id(503),
      classSubjectId: id(14),
      scheduleId: null,
      publication: "published",
      validFrom: null,
      validTo: null,
      weekday: 1,
      startsAt: "08:00",
      endsAt: "08:45",
      room: null,
    },
  ],
  tasks: [],
});
const attendance = (sessions: AcademicAttendance["sessions"] = []): AcademicAttendance => ({
  schoolId: ctx.schoolId,
  role: "professor",
  from: "2026-10-01",
  to: "2026-10-31",
  sessions,
  teacherLessons: [
    {
      id: id(600),
      classSubjectId: id(12),
      date: DAY,
      startsAt: "11:00",
      endsAt: "11:45",
      status: "scheduled",
    },
  ],
});
const gateway = (recordAttendanceCall?: Gateway["recordAttendanceCall"]): Gateway => ({
  session: async () => null,
  workspace: async () => {
    throw Error("unused");
  },
  execute: async () => {},
  signOut: async () => {},
  ...(recordAttendanceCall ? { recordAttendanceCall } : {}),
});
afterEach(cleanup);

describe("turmas com chamada por fazer", () => {
  it("usa o horário em vigor nesse dia da semana e as ocorrências, sem turmas vazias", () => {
    expect(callableClasses(catalog(), attendance(), DAY).map((c) => c.classSubjectId)).toEqual([
      id(10),
      id(12),
    ]);
  });
  it("tira as que já têm a chamada fechada ou a aula cancelada e mantém as pendentes", () => {
    const sessions = (status: "pending" | "completed" | "cancelled", cs: number) => ({
      id: id(700 + cs),
      classSubjectId: id(cs),
      date: DAY,
      startsAt: null,
      endsAt: null,
      status,
      records: [],
    });
    expect(
      callableClasses(
        catalog(),
        attendance([sessions("completed", 10), sessions("cancelled", 12)]),
        DAY,
      ),
    ).toEqual([]);
    expect(
      callableClasses(catalog(), attendance([sessions("pending", 14)]), DAY).map(
        (c) => c.classSubjectId,
      ),
    ).toEqual([id(10), id(12), id(14)]);
  });
});

describe("recibo da chamada", () => {
  const input = {
    classSubjectId: id(10),
    date: DAY,
    records: [{ studentId: id(50), status: "present" as const }],
  };
  const ok = {
    ...ctx,
    classSubjectId: id(10),
    sessionId: id(800),
    date: DAY,
    count: 1,
    status: "completed",
  };
  it("aceita só o recibo da própria chamada", () => {
    expect(parseAttendanceCallReceipt(ok, ctx, input)).toEqual(ok);
    for (const bad of [
      { ...ok, schoolId: id(9) },
      { ...ok, classSubjectId: id(11) },
      { ...ok, date: "2026-10-08" },
      { ...ok, count: 2 },
      { ...ok, status: "pending" },
      { ...ok, sessionId: "x" },
      { ...ok, extra: 1 },
    ])
      expect(() => parseAttendanceCallReceipt(bad, ctx, input)).toThrow();
  });
});

describe("interface da chamada", () => {
  const view = (record?: Gateway["recordAttendanceCall"], onSaved = vi.fn(), extra = {}) =>
    render(
      <AttendanceCall
        ctx={ctx}
        gateway={gateway(record)}
        catalog={catalog()}
        attendance={attendance()}
        date={DAY}
        today={DAY}
        onSaved={onSaved}
        {...extra}
      />,
    );
  it("grava todos presentes por omissão, com a marcação alterada, só depois de confirmar", async () => {
    const record = vi.fn().mockImplementation(async (_ctx, input) => ({
      ...ctx,
      classSubjectId: input.classSubjectId,
      sessionId: id(800),
      date: input.date,
      count: input.records.length,
      status: "completed",
    }));
    const onSaved = vi.fn();
    view(record, onSaved);
    fireEvent.click(screen.getByText("Fazer chamada · 10.ª 10 · Disciplina 10"));
    fireEvent.change(screen.getByLabelText("Presença de Aluno 51"), {
      target: { value: "absent" },
    });
    fireEvent.click(screen.getByText("Gravar e fechar chamada"));
    expect(record).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/1 presente · 1 falta/);
    fireEvent.click(screen.getByText("Confirmar e gravar"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(record).toHaveBeenCalledWith(ctx, {
      classSubjectId: id(10),
      date: DAY,
      records: [
        { studentId: id(50), status: "present" },
        { studentId: id(51), status: "absent" },
      ],
    });
    expect(onSaved.mock.calls[0]![0]).toMatch(/gravada e fechada \(2 alunos\)/);
  });
  it("explica cada recusa do servidor e não fecha o formulário", async () => {
    const cases: [ApiError, RegExp][] = [
      [new ApiError(409, "x", "ATTENDANCE_ALREADY_CLOSED"), /Corrigir chamada/],
      [new ApiError(409, "x", "ATTENDANCE_PERIOD_LOCKED"), /pauta deste período já é oficial/],
      [new ApiError(403, "x", "MFA_REQUIRED"), /segundo factor/],
      [new ApiError(422, "x", "ATTENDANCE_STUDENT_NOT_ENROLLED"), /lista de alunos/],
    ];
    for (const [error, message] of cases) {
      const onSaved = vi.fn();
      view(vi.fn().mockRejectedValue(error), onSaved);
      fireEvent.click(screen.getByText("Fazer chamada · 10.ª 10 · Disciplina 10"));
      fireEvent.click(screen.getByText("Gravar e fechar chamada"));
      fireEvent.click(screen.getByText("Confirmar e gravar"));
      expect((await screen.findByRole("alert")).textContent).toMatch(message);
      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.getByText("Gravar e fechar chamada")).toBeTruthy();
      cleanup();
    }
  });
  it("não oferece a chamada ao aluno, num dia futuro, nem numa ligação sem escrita", () => {
    view(vi.fn(), vi.fn(), { ctx: { ...ctx, role: "aluno" } });
    expect(screen.queryByText(/Fazer chamada/)).toBeNull();
    cleanup();
    view(vi.fn(), vi.fn(), { today: "2026-10-08" });
    expect(screen.queryByText(/Fazer chamada/)).toBeNull();
    cleanup();
    view(undefined);
    expect(screen.queryByText(/Fazer chamada/)).toBeNull();
  });
});
