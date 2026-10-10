import { beforeEach, describe, expect, it, vi } from "vitest";

const guards = vi.hoisted(() => ({
  assertAttendanceNotLocked: vi.fn(),
  recomputeAttendanceRates: vi.fn(),
}));
vi.mock("@/features/pedagogica/attendance-guards", () => guards);

import { recordMobileAttendanceCall } from "@/features/mobile-v4/attendance-call.server";
import type { MobileAcademicScope } from "@/features/mobile-v4/academic-scope.server";
import type { CallStatus } from "../../mobile-v4/src/domain/attendance";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SCHOOL = id(1);
const TEACHER = id(2);
const CS = id(3);
const GROUP = id(4);
const SUBJECT = id(5);
const SESSION = id(6);
const USER = id(7);
const [A, B, C] = [id(10), id(11), id(12)];
const scope: MobileAcademicScope = {
  schoolId: SCHOOL,
  role: "professor",
  teacherId: TEACHER,
  studentId: null,
  classGroupIds: [GROUP],
  classSubjectIds: [CS],
  enrollmentIds: [],
};
const input = (
  records: { studentId: string; status: CallStatus }[] = [A, B].map((studentId) => ({
    studentId,
    status: "present",
  })),
) => ({
  classSubjectId: CS,
  date: "2026-10-09",
  records,
});

type Op = [string, unknown[]];
type Result = { data?: unknown; error?: unknown; count?: number | null };
/** Base simulada: cada consulta guarda as operações e responde pela regra dada. */
function database(answer: (table: string, ops: Op[]) => Result) {
  const queries: { table: string; ops: Op[] }[] = [];
  const db = {
    from(table: string) {
      const ops: Op[] = [];
      queries.push({ table, ops });
      const q: Record<string, unknown> = {};
      for (const m of [
        "select",
        "eq",
        "in",
        "limit",
        "insert",
        "update",
        "upsert",
        "single",
        "maybeSingle",
      ])
        q[m] = (...args: unknown[]) => {
          ops.push([m, args]);
          return q;
        };
      q.then = (resolve: (v: unknown) => void) =>
        resolve({ error: null, count: null, ...answer(table, ops) });
      return q;
    },
  };
  return { db: db as never, queries };
}
const has = (ops: Op[], name: string) => ops.some(([m]) => m === name);
const session = (extra: Record<string, unknown> = {}) => ({
  id: SESSION,
  class_group_id: GROUP,
  subject_id: SUBJECT,
  teacher_id: TEACHER,
  status: "pending",
  lesson_date: "2026-10-09",
  ...extra,
});
/** Caminho feliz, com desvios por tabela. */
function happy(over: Partial<Record<string, (ops: Op[]) => Result>> = {}) {
  return database((table, ops) => {
    if (over[table]) return over[table]!(ops);
    if (table === "class_subjects")
      return { data: { id: CS, class_group_id: GROUP, subject_id: SUBJECT, teacher_id: TEACHER } };
    if (table === "siga_attendance_sessions")
      return has(ops, "update") ? {} : { data: [session()] };
    if (table === "enrollments") return { data: [A, B].map((s) => ({ student_id: s })), count: 2 };
    if (table === "siga_attendance_records") return {};
    throw new Error("tabela inesperada " + table);
  });
}

beforeEach(() => {
  guards.assertAttendanceNotLocked.mockReset().mockResolvedValue(undefined);
  guards.recomputeAttendanceRates.mockReset().mockResolvedValue(undefined);
});

describe("chamada do professor no Mobile", () => {
  it("grava num só upsert, recalcula a taxa e fecha a sessão, tudo na escola do professor", async () => {
    const { db, queries } = happy();
    const receipt = await recordMobileAttendanceCall(db, scope, USER, input());
    expect(receipt).toEqual({
      schoolId: SCHOOL,
      userId: USER,
      role: "professor",
      classSubjectId: CS,
      sessionId: SESSION,
      date: "2026-10-09",
      count: 2,
      status: "completed",
    });
    const upserts = queries.filter((q) => q.table === "siga_attendance_records");
    expect(upserts).toHaveLength(1);
    const [rows, options] = upserts[0]!.ops.find(([m]) => m === "upsert")![1] as [
      Record<string, unknown>[],
      unknown,
    ];
    expect(options).toEqual({ onConflict: "session_id,student_id" });
    expect(
      rows.map((r) => [r.school_id, r.session_id, r.student_id, r.status, r.recorded_by]),
    ).toEqual([
      [SCHOOL, SESSION, A, "present", USER],
      [SCHOOL, SESSION, B, "present", USER],
    ]);
    expect(guards.recomputeAttendanceRates).toHaveBeenCalledWith(db, SCHOOL, [A, B]);
    const close = queries.find(
      (q) => q.table === "siga_attendance_sessions" && has(q.ops, "update"),
    )!;
    expect(close.ops).toContainEqual(["eq", ["school_id", SCHOOL]]);
    expect(close.ops).toContainEqual(["eq", ["id", SESSION]]);
    expect((close.ops.find(([m]) => m === "update")![1][0] as { status: string }).status).toBe(
      "completed",
    );
    // Cada leitura e escrita filtra a escola; o upsert leva-a em cada linha (acima).
    for (const q of queries.filter((x) => x.table !== "siga_attendance_records"))
      expect(q.ops).toContainEqual(["eq", ["school_id", SCHOOL]]);
  });

  it("verifica a pauta oficial antes de gravar", async () => {
    const order: string[] = [];
    guards.assertAttendanceNotLocked.mockImplementation(async () => {
      order.push("pauta");
    });
    const { db } = happy({
      siga_attendance_records: () => {
        order.push("upsert");
        return {};
      },
    });
    await recordMobileAttendanceCall(db, scope, USER, input());
    expect(order).toEqual(["pauta", "upsert"]);
    expect(guards.assertAttendanceNotLocked).toHaveBeenCalledWith(db, SCHOOL, session());
  });

  it("abre a sessão do dia quando ainda não existe, como o portal", async () => {
    const { db, queries } = happy({
      siga_attendance_sessions: (ops) =>
        has(ops, "insert") ? { data: session() } : has(ops, "update") ? {} : { data: [] },
    });
    await recordMobileAttendanceCall(db, scope, USER, input());
    const insert = queries.find((q) => has(q.ops, "insert"))!;
    expect(insert.ops.find(([m]) => m === "insert")![1][0]).toEqual({
      school_id: SCHOOL,
      class_group_id: GROUP,
      subject_id: SUBJECT,
      teacher_id: TEACHER,
      lesson_date: "2026-10-09",
      status: "pending",
      created_by: USER,
    });
  });

  const refuses = async (status: number, code: string, run: () => Promise<unknown>) => {
    await expect(run()).rejects.toMatchObject({ status, code });
  };

  it("recusa quem não é o professor da turma, em qualquer etapa", async () => {
    await refuses(403, "ROLE_FORBIDDEN", () =>
      recordMobileAttendanceCall(happy().db, { ...scope, role: "aluno" }, USER, input()),
    );
    await refuses(403, "CLASS_FORBIDDEN", () =>
      recordMobileAttendanceCall(happy().db, { ...scope, classSubjectIds: [] }, USER, input()),
    );
    await refuses(403, "CLASS_FORBIDDEN", () =>
      recordMobileAttendanceCall(
        happy({
          class_subjects: () => ({
            data: { class_group_id: GROUP, subject_id: SUBJECT, teacher_id: id(99) },
          }),
        }).db,
        scope,
        USER,
        input(),
      ),
    );
    await refuses(403, "CLASS_FORBIDDEN", () =>
      recordMobileAttendanceCall(
        happy({
          siga_attendance_sessions: () => ({ data: [session({ teacher_id: id(99) })] }),
        }).db,
        scope,
        USER,
        input(),
      ),
    );
  });

  it("recusa um dia futuro, sessões ambíguas ou canceladas, chamada fechada e pauta oficial", async () => {
    await refuses(422, "ATTENDANCE_FUTURE_DATE", () =>
      recordMobileAttendanceCall(happy().db, scope, USER, { ...input(), date: "2999-01-01" }),
    );
    await refuses(409, "ATTENDANCE_SESSION_AMBIGUOUS", () =>
      recordMobileAttendanceCall(
        happy({ siga_attendance_sessions: () => ({ data: [session(), session({ id: id(8) })] }) })
          .db,
        scope,
        USER,
        input(),
      ),
    );
    await refuses(409, "ATTENDANCE_SESSION_CANCELLED", () =>
      recordMobileAttendanceCall(
        happy({ siga_attendance_sessions: () => ({ data: [session({ status: "cancelled" })] }) })
          .db,
        scope,
        USER,
        input(),
      ),
    );
    await refuses(409, "ATTENDANCE_ALREADY_CLOSED", () =>
      recordMobileAttendanceCall(
        happy({ siga_attendance_sessions: () => ({ data: [session({ status: "completed" })] }) })
          .db,
        scope,
        USER,
        input(),
      ),
    );
    guards.assertAttendanceNotLocked.mockRejectedValueOnce(
      new Error("A pauta deste período já é oficial: as presenças desta aula já não se alteram."),
    );
    await refuses(409, "ATTENDANCE_PERIOD_LOCKED", () =>
      recordMobileAttendanceCall(happy().db, scope, USER, input()),
    );
    guards.assertAttendanceNotLocked.mockRejectedValueOnce(new Error("falha da base"));
    await refuses(503, "ATTENDANCE_UNAVAILABLE", () =>
      recordMobileAttendanceCall(happy().db, scope, USER, input()),
    );
  });

  it("só aceita alunos matriculados e nunca grava parcialmente uma lista truncada", async () => {
    const outsider = input([{ studentId: id(50), status: "absent" }]);
    const first = happy();
    await refuses(422, "ATTENDANCE_STUDENT_NOT_ENROLLED", () =>
      recordMobileAttendanceCall(first.db, scope, USER, outsider),
    );
    expect(first.queries.some((q) => q.table === "siga_attendance_records")).toBe(false);
    await refuses(503, "ATTENDANCE_UNAVAILABLE", () =>
      recordMobileAttendanceCall(
        happy({ enrollments: () => ({ data: [{ student_id: A }], count: 2 }) }).db,
        scope,
        USER,
        input(),
      ),
    );
  });

  it("não fecha a chamada com um aluno da turma por marcar", async () => {
    const call = happy({
      enrollments: (ops) => {
        expect(ops).toContainEqual(["in", ["status", ["active", "pending"]]]);
        return { data: [A, B, C].map((s) => ({ student_id: s })), count: 3 };
      },
    });
    await refuses(409, "ATTENDANCE_ROSTER_CHANGED", () =>
      recordMobileAttendanceCall(call.db, scope, USER, input()),
    );
    expect(call.queries.some((q) => q.table === "siga_attendance_records")).toBe(false);
    expect(
      call.queries.some((q) => q.table === "siga_attendance_sessions" && has(q.ops, "update")),
    ).toBe(false);
  });

  it("um erro ao gravar ou ao fechar não é dado como sucesso", async () => {
    await refuses(503, "ATTENDANCE_WRITE_FAILED", () =>
      recordMobileAttendanceCall(
        happy({ siga_attendance_records: () => ({ error: { message: "x" } }) }).db,
        scope,
        USER,
        input(),
      ),
    );
    expect(guards.recomputeAttendanceRates).not.toHaveBeenCalled();
    await refuses(503, "ATTENDANCE_NOT_CLOSED", () =>
      recordMobileAttendanceCall(
        happy({
          siga_attendance_sessions: (ops) =>
            has(ops, "update") ? { error: { message: "x" } } : { data: [session()] },
        }).db,
        scope,
        USER,
        input(),
      ),
    );
  });
});
