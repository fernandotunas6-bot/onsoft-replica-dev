import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let membership: { schoolId: string; appRole: string } | null = null;
let ownTeacher: string | null = null;
let visibleStudent: string | null = null;

/** Base em memória com o que este módulo usa: leituras, insert e update. */
function memoryDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Row | null = null;
      let inserted: Row | null = null;
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const run = () => {
        if (inserted) {
          const list = (tables[table] ??= []);
          const clash = list.some(
            (r) =>
              r.task_id === inserted!.task_id &&
              r.enrollment_id === inserted!.enrollment_id &&
              r.attempt === inserted!.attempt,
          );
          if (clash) return { data: null, error: { code: "23505", message: "duplicate" } };
          list.push({
            id: `00000000-0000-0000-0000-${String(list.length + 1).padStart(12, "0")}`,
            ...inserted,
          });
          return { data: null, error: null };
        }
        const found = rows();
        if (patch) for (const row of found) Object.assign(row, patch);
        return { data: found, error: null };
      };
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        insert: (row: Row) => {
          inserted = row;
          return chain;
        },
        update: (row: Row) => {
          patch = row;
          return chain;
        },
        maybeSingle: () => {
          const result = run();
          return Promise.resolve({
            data: Array.isArray(result.data) ? (result.data[0] ?? null) : null,
            error: result.error,
          });
        },
        then: (resolve: (value: unknown) => unknown) => resolve(run()),
      };
      return chain;
    },
  };
}

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => memoryDb(),
  resolveSgaMembershipAdmin: async () => membership,
}));
vi.mock("./own-teacher", () => ({ ownTeacherId: async () => ownTeacher }));
vi.mock("@/features/academic/own-teacher", () => ({ ownTeacherId: async () => ownTeacher }));
vi.mock("@/features/dashboard/student-access", () => ({
  resolveVisibleStudent: async () =>
    visibleStudent && membership
      ? { db: memoryDb(), schoolId: membership.schoolId, studentId: visibleStudent }
      : null,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      validator: (parse: (input: unknown) => unknown) => {
        fn.parse = parse;
        return fn;
      },
      middleware: () => fn,
      handler:
        (h: (ctx: { data: unknown; context: { userId: string } }) => unknown) =>
        (call: { data: unknown }) =>
          h({ data: fn.parse(call.data), context: { userId: "u1" } }),
      parse: (input: unknown) => input,
    };
    return fn;
  },
}));

const server = await import("@/features/academic/task-submissions-server");

const S = "00000000-0000-0000-0000-00000000000a";
const TASK = "00000000-0000-0000-0000-0000000000f1";
const E1 = "00000000-0000-0000-0000-0000000000e1";
const E2 = "00000000-0000-0000-0000-0000000000e2";

beforeEach(() => {
  membership = { schoolId: S, appRole: "Aluno" };
  ownTeacher = null;
  visibleStudent = "st1";
  tables = {
    siga_class_tasks: [
      {
        id: TASK,
        school_id: S,
        class_subject_id: "cs1",
        status: "published",
        due_on: "2099-12-31",
        accepts_late: false,
        title: "Resumo",
      },
    ],
    class_subjects: [{ id: "cs1", school_id: S, class_group_id: "cg1", teacher_id: "t1" }],
    enrollments: [
      { id: E1, school_id: S, student_id: "st1", class_group_id: "cg1", status: "active" },
      { id: E2, school_id: S, student_id: "st2", class_group_id: "cg2", status: "active" },
    ],
    students: [{ id: "st1", school_id: S, person_id: "p1" }],
    people: [{ id: "p1", school_id: S, full_name: "Ana" }],
    siga_class_task_submissions: [],
  };
});

describe("entregas no servidor", () => {
  it("o aluno entrega e reenvia na sua matrícula; a nota fica escondida até devolver", async () => {
    expect(await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } })).toEqual({
      attempt: 1,
      late: false,
    });
    expect(await server.submitTaskWork({ data: { taskId: TASK, body: "v2" } })).toMatchObject({
      attempt: 2,
    });
    const mine = await server.getMyTaskSubmission({ data: { taskId: TASK } });
    expect(mine).toMatchObject({ canSubmit: true, submission: { attempt: 2, grade: null } });
  });

  it("o encarregado vê, mas não entrega", async () => {
    membership = { schoolId: S, appRole: "Encarregado" };
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "x" } })).rejects.toThrow(
      "Só o aluno pode entregar o trabalho.",
    );
    expect(await server.getMyTaskSubmission({ data: { taskId: TASK } })).toMatchObject({
      canSubmit: false,
    });
  });

  it("aluno de outra turma não vê nem entrega", async () => {
    visibleStudent = "st2";
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "x" } })).rejects.toThrow(
      "Tarefa não encontrada.",
    );
  });

  it("depois do prazo, numa tarefa que não aceita atrasos, recusa", async () => {
    tables.siga_class_tasks![0]!.due_on = "2000-01-01";
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "x" } })).rejects.toThrow(
      "não aceita entregas atrasadas",
    );
  });

  it("professor de outra disciplina é recusado; o da disciplina vê e devolve uma vez", async () => {
    await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } });
    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t9";
    await expect(server.listTaskSubmissions({ data: { taskId: TASK } })).rejects.toThrow(
      "Só o professor desta disciplina",
    );

    ownTeacher = "t1";
    const listed = await server.listTaskSubmissions({ data: { taskId: TASK } });
    expect(listed).toMatchObject({ title: "Resumo", acceptsLate: false });
    const [line] = listed.lines;
    expect(line).toMatchObject({ studentName: "Ana", attempts: 1 });
    const submissionId = String(line!.submission!.id);
    await server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 15 } });
    await expect(
      server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 18 } }),
    ).rejects.toThrow("já foi devolvida");

    membership = { schoolId: S, appRole: "Aluno" };
    expect(await server.getMyTaskSubmission({ data: { taskId: TASK } })).toMatchObject({
      submission: { status: "returned", grade: 15 },
    });
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "v2" } })).rejects.toThrow(
      "já devolveu",
    );
  });

  it("entrega em papel só para alunos matriculados na turma da tarefa", async () => {
    membership = { schoolId: S, appRole: "Secretaria" };
    expect(
      await server.recordPaperSubmission({ data: { taskId: TASK, enrollmentId: E1 } }),
    ).toEqual({ attempt: 1 });
    await expect(
      server.recordPaperSubmission({ data: { taskId: TASK, enrollmentId: E2 } }),
    ).rejects.toThrow("não está matriculado nesta turma");
  });
});
