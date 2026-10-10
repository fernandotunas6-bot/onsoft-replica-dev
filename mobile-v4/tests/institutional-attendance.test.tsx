import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AcademicAttendance } from "../src/domain/attendance";
import type { AcademicCatalog } from "../src/domain/catalog";
import type { Context, Gateway } from "../src/domain/model";
import { parseAcademicAttendance } from "../src/domain/attendance-validation";
import { InstitutionalAttendance } from "../src/components/InstitutionalAttendance";
import { ApiGateway, ApiError } from "../src/services/api";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pupil: Context = { schoolId: id(1), userId: id(2), role: "aluno" };
const teacher: Context = { schoolId: id(1), userId: id(3), role: "professor" };
const range = { from: "2026-10-01", to: "2026-10-31" };
function catalog(ctx = pupil): AcademicCatalog {
  return {
    schoolId: ctx.schoolId,
    role: ctx.role,
    classes: [
      {
        classSubjectId: id(4),
        classGroupId: id(5),
        academicYearId: id(6),
        subjectId: id(7),
        className: "Turma de ensaio",
        subjectName: "Matemática",
        teacher: { id: id(8), userId: teacher.userId, name: "Docente" },
        students: [
          { studentId: id(9), userId: pupil.userId, enrollmentId: id(10), name: "Aluno próprio" },
        ],
      },
    ],
    timetable: [],
    tasks: [],
  };
}
function data(ctx = pupil): AcademicAttendance {
  return {
    schoolId: ctx.schoolId,
    role: ctx.role,
    ...range,
    sessions: [
      {
        id: id(11),
        classSubjectId: id(4),
        date: "2026-10-06",
        startsAt: null,
        endsAt: null,
        status: "completed",
        records: [{ studentId: id(9), status: "absent" }],
      },
    ],
    teacherLessons: [],
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("accepts own institutional status and nullable lesson time without replacement", () => {
  expect(parseAcademicAttendance(data(), pupil, catalog(), range).sessions[0].startsAt).toBeNull();
});
it.each([
  "school",
  "role",
  "peer",
  "draft",
  "foreign-class",
  "extra-field",
  "wrong-period",
  "duplicate",
])("rejects %s contract leakage or inconsistency", (kind) => {
  const d = data();
  if (kind === "school") d.schoolId = id(20);
  if (kind === "role") d.role = "professor";
  if (kind === "peer") d.sessions[0].records[0].studentId = id(20);
  if (kind === "draft") d.sessions[0].status = "pending";
  if (kind === "foreign-class") d.sessions[0].classSubjectId = id(20);
  if (kind === "extra-field") Object.assign(d, { notes: "private note" });
  if (kind === "wrong-period") d.from = "2026-09-01";
  if (kind === "duplicate") d.sessions.push(d.sessions[0]);
  expect(() => parseAcademicAttendance(d, pupil, catalog(), range)).toThrow(
    "Contrato de presenças inválido",
  );
});
it("refuses teacher HR rows in a pupil response", () => {
  const d = data();
  d.teacherLessons = [
    {
      id: id(12),
      classSubjectId: id(4),
      date: "2026-10-06",
      startsAt: "07:00:00",
      endsAt: "08:00:00",
      status: "confirmed",
    },
  ];
  expect(() => parseAcademicAttendance(d, pupil, catalog(), range)).toThrow();
});
it("uses authenticated HTTP attendance range and validates the response", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        userId: pupil.userId,
        name: "Conta do teste",
        memberships: [
          {
            schoolId: pupil.schoolId,
            schoolName: "Escola do teste",
            active: true,
            roles: ["aluno"],
            permissions: ["academic.read"],
          },
        ],
      }),
    })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => data() });
  vi.stubGlobal("fetch", fetch);
  const gateway = new ApiGateway("/api/mobile-v4", {
    accessToken: async () => "controlled-session",
  });
  await gateway.session();
  await gateway.academicAttendance(pupil, range, catalog());
  expect(fetch.mock.calls[1][0]).toContain("/attendance?role=aluno&from=2026-10-01&to=2026-10-31");
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer controlled-session");
  expect(fetch.mock.calls[1][1].cache).toBe("no-store");
});
function gateway(read: Gateway["academicAttendance"]): Gateway {
  return {
    academicAttendance: read,
    session: vi.fn(),
    workspace: vi.fn(),
    execute: vi.fn(),
    signOut: vi.fn(),
  };
}
it("shows a pupil absence only from the completed call, with no inferred lesson", async () => {
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  render(
    <InstitutionalAttendance
      ctx={pupil}
      catalog={catalog()}
      gateway={gateway(vi.fn().mockResolvedValue(data()))}
    />,
  );
  await screen.findByText("Chamada concluída", { exact: false });
  expect(screen.getByRole("button", { name: "2026-10-06: Falta" }).className).toContain("ausente");
  expect(screen.getByRole("button", { name: "2026-10-07: Sem aulas" })).not.toBeNull();
  expect(screen.getByText("Hora não indicada", { exact: false })).not.toBeNull();
});
it("never colours teacher attendance from pupil call marks", async () => {
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  const d = data(teacher);
  d.sessions[0].records[0].status = "present";
  render(
    <InstitutionalAttendance
      ctx={teacher}
      catalog={catalog(teacher)}
      gateway={gateway(vi.fn().mockResolvedValue(d))}
    />,
  );
  await screen.findByText("Aluno próprio: Presente");
  expect(
    screen.getByRole("button", { name: "2026-10-06: Sem ocorrências docentes" }),
  ).not.toBeNull();
  expect(screen.getByText("Sem ocorrências docentes registadas neste dia.")).not.toBeNull();
});
it("clears the month immediately and ignores a previous month's late response", async () => {
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  let finish!: (d: AcademicAttendance) => void;
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<AcademicAttendance>((r) => {
          finish = r;
        }),
    )
    .mockResolvedValueOnce({ ...data(), from: "2026-11-01", to: "2026-11-30", sessions: [] });
  render(<InstitutionalAttendance ctx={pupil} catalog={catalog()} gateway={gateway(read)} />);
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Mês seguinte" }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  finish(data());
  await screen.findByText("Sem chamadas registadas neste dia.");
  expect(screen.queryByText("Chamada concluída", { exact: false })).toBeNull();
});
it("reports a denied school to clear the parent's institutional context", async () => {
  const onAccessError = vi.fn();
  render(
    <InstitutionalAttendance
      ctx={pupil}
      catalog={catalog()}
      gateway={gateway(vi.fn().mockRejectedValue(new ApiError(403, "Sem autorização")))}
      onAccessError={onAccessError}
    />,
  );
  await screen.findByRole("alert");
  expect(onAccessError).toHaveBeenCalledOnce();
});
