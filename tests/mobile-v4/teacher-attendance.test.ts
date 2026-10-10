import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AttendanceCallError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    AttendanceCallError,
    access: vi.fn(),
    scope: vi.fn(),
    catalog: vi.fn(),
    prepare: vi.fn(),
    record: vi.fn(),
    rows: [] as unknown[],
    rowsError: null as unknown,
    queries: [] as Array<[string, ...unknown[]]>,
  };
});

function query() {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "limit"]) {
    chain[name] = (...args: unknown[]) => {
      mocks.queries.push([name, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: mocks.rows, error: mocks.rowsError });
  return chain;
}
const db = { from: (table: string) => (mocks.queries.push(["from", table]), query()) };

vi.mock("@/features/mobile-v4/authorization", () => ({
  requireMobileAcademicAccess: mocks.access,
}));
vi.mock("@/features/mobile-v4/academic-scope.server", () => ({
  resolveMobileAcademicScope: mocks.scope,
}));
vi.mock("@/features/mobile-v4/academic-catalog.server", () => ({
  readMobileAcademicCatalog: mocks.catalog,
}));
vi.mock("@/features/pedagogica/attendance-core.server", () => ({
  prepareTeacherDaySessions: mocks.prepare,
  recordAttendanceCall: mocks.record,
  AttendanceCallError: mocks.AttendanceCallError,
}));
vi.mock("@/lib/school-date", () => ({ schoolTodayIso: () => "2026-10-10" }));

import {
  loadMobileV4TeacherDay,
  recordMobileV4Attendance,
} from "@/features/mobile-v4/teacher-attendance.server";

const school = "11111111-1111-4111-8111-111111111111";
const session = "33333333-3333-4333-8333-333333333333";
const studentA = "44444444-4444-4444-8444-444444444444";
const studentB = "55555555-5555-4555-8555-555555555555";
const requestId = "22222222-2222-4222-8222-222222222222";

const call = (entries: { studentId: string; status: "presente" | "ausente" | "justificada" }[]) =>
  recordMobileV4Attendance("teacher-user", {
    schoolId: school,
    role: "professor",
    requestId,
    command: { type: "attendance", lessonId: session, entries },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.rowsError = null;
  mocks.queries = [];
  mocks.access.mockResolvedValue({ db });
  mocks.scope.mockResolvedValue({ schoolId: school, role: "professor", teacherId: "teacher-1" });
  mocks.catalog.mockResolvedValue({
    classes: [{ classSubjectId: "cs-1", classGroupId: "group-1", subjectId: "math" }],
  });
});

describe("aulas de hoje do professor", () => {
  it("só o papel professor, sem chegar aos dados", async () => {
    await expect(
      loadMobileV4TeacherDay("user", { schoolId: school, role: "aluno" }),
    ).rejects.toMatchObject({ status: 403, code: "TEACHER_ONLY" });
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("prepara as sessões de hoje como o portal e devolve só as do catálogo autorizado", async () => {
    mocks.prepare.mockResolvedValue({
      date: "2026-10-10",
      sessions: [
        {
          id: session,
          timetable_slot_id: "slot-1",
          class_group_id: "group-1",
          subject_id: "math",
          starts_at: "08:00",
          ends_at: "08:45",
          room: "A1",
          status: "pending",
        },
        // Sem sessão criada (id do horário) e fora do catálogo: ficam de fora.
        {
          id: "slot-2",
          timetable_slot_id: "slot-2",
          class_group_id: "group-1",
          subject_id: "math",
        },
        { id: "other", timetable_slot_id: "slot-3", class_group_id: "group-9", subject_id: "math" },
      ],
    });
    mocks.rows = [{ session_id: session, student_id: studentA, status: "present" }];
    const day = await loadMobileV4TeacherDay("teacher-user", {
      schoolId: school,
      role: "professor",
    });
    expect(mocks.access).toHaveBeenCalledWith("teacher-user", school, "professor", "read");
    expect(mocks.prepare).toHaveBeenCalledWith(
      db,
      { schoolId: school, appRole: "Professor", userId: "teacher-user", teacherId: "teacher-1" },
      { date: "2026-10-10" },
    );
    expect(day).toEqual({
      schoolId: school,
      date: "2026-10-10",
      lessons: [
        {
          sessionId: session,
          classSubjectId: "cs-1",
          startsAt: "08:00",
          endsAt: "08:45",
          room: "A1",
          status: "pending",
          records: [{ studentId: studentA, status: "present" }],
        },
      ],
    });
    expect(mocks.queries).toContainEqual(["eq", "school_id", school]);
  });
});

describe("comando de chamada", () => {
  it("grava com a lógica do portal, como Professor, com os estados do SIGA", async () => {
    mocks.record.mockResolvedValue({ ok: true, sessionId: session, count: 2 });
    await expect(
      call([
        { studentId: studentA, status: "presente" },
        { studentId: studentB, status: "justificada" },
      ]),
    ).resolves.toEqual({ ok: true, sessionId: session, count: 2, replayed: false });
    expect(mocks.access).toHaveBeenCalledWith("teacher-user", school, "professor", "write");
    expect(mocks.record).toHaveBeenCalledWith(
      db,
      { schoolId: school, appRole: "Professor", userId: "teacher-user", teacherId: "teacher-1" },
      {
        sessionId: session,
        records: [
          { studentId: studentA, status: "present" },
          { studentId: studentB, status: "excused" },
        ],
      },
    );
  });

  it("recusa ids que não são da base antes de gravar", async () => {
    await expect(
      recordMobileV4Attendance("teacher-user", {
        schoolId: school,
        role: "professor",
        requestId,
        command: {
          type: "attendance",
          lessonId: "lesson-1",
          entries: [{ studentId: studentA, status: "ausente" }],
        },
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_LESSON" });
    await expect(call([{ studentId: "aluno-1", status: "ausente" }])).rejects.toMatchObject({
      status: 422,
      code: "INVALID_STUDENT",
    });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("repetir o mesmo envio numa chamada já fechada é sucesso sem nova escrita", async () => {
    mocks.record.mockRejectedValue(new mocks.AttendanceCallError("ALREADY_CLOSED", "fechada"));
    mocks.rows = [{ student_id: studentA, status: "absent" }];
    await expect(call([{ studentId: studentA, status: "ausente" }])).resolves.toMatchObject({
      ok: true,
      replayed: true,
    });
  });

  it("chamada fechada com outros estados só se corrige no portal", async () => {
    mocks.record.mockRejectedValue(new mocks.AttendanceCallError("ALREADY_CLOSED", "fechada"));
    mocks.rows = [{ student_id: studentA, status: "present" }];
    await expect(call([{ studentId: studentA, status: "ausente" }])).rejects.toMatchObject({
      status: 409,
      code: "ATTENDANCE_ALREADY_CLOSED",
    });
  });

  it.each([
    ["SESSION_NOT_FOUND", 404],
    ["NOT_SESSION_TEACHER", 403],
    ["NOT_ENROLLED", 422],
    ["PERIOD_LOCKED", 409],
  ])("traduz %s em %i sem detalhes", async (code, status) => {
    mocks.record.mockRejectedValue(new mocks.AttendanceCallError(code, "mensagem interna"));
    await expect(call([{ studentId: studentA, status: "presente" }])).rejects.toMatchObject({
      status,
      code,
    });
  });

  it("um erro inesperado não vira sucesso", async () => {
    mocks.record.mockRejectedValue(new Error("db down"));
    await expect(call([{ studentId: studentA, status: "presente" }])).rejects.toThrow("db down");
  });
});
