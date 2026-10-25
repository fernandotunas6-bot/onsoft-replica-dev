import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let role = "Aluno";
let visibleStudent: string | null = "st1";

/** Base em memória com as leituras que a página usa. */
function memoryDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        neq: (column: string, value: unknown) => {
          filters.push((row) => row[column] !== value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: rows(), error: null }),
      };
      return chain;
    },
  };
}

const S = "00000000-0000-0000-0000-00000000000a";
const SUBJECT = "00000000-0000-0000-0000-0000000000b1";

vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => ({ schoolId: S, appRole: role }),
}));
vi.mock("@/features/dashboard/student-access", () => ({
  resolveVisibleStudent: async () =>
    visibleStudent ? { db: memoryDb(), schoolId: S, studentId: visibleStudent } : null,
}));
vi.mock("@/features/calendar/dates", () => ({ todayInLuanda: () => "2026-11-05" }));
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

const { getMySubjectWork } = await import("@/features/academic/subject-work-server");

const task = (id: string, extra: Row = {}): Row => ({
  id,
  school_id: S,
  class_subject_id: "cs-now",
  kind: "trabalho",
  title: `Trabalho ${id}`,
  description: null,
  due_on: "2026-11-01",
  status: "published",
  accepts_late: true,
  assessment_item_id: null,
  created_at: "2026-10-01",
  ...extra,
});
const submission = (taskId: string, attempt: number, extra: Row = {}): Row => ({
  id: `${taskId}-${attempt}`,
  school_id: S,
  task_id: taskId,
  enrollment_id: "e-now",
  attempt,
  status: "submitted",
  submitted_at: "2026-10-30T10:00:00Z",
  is_late: false,
  on_paper: false,
  body: `v${attempt}`,
  grade: null,
  feedback: null,
  returned_at: null,
  ...extra,
});

beforeEach(() => {
  role = "Aluno";
  visibleStudent = "st1";
  tables = {
    subjects: [{ id: SUBJECT, school_id: S, name: "Matemática" }],
    enrollments: [
      { id: "e-now", school_id: S, student_id: "st1", class_group_id: "cg-now", status: "active" },
      { id: "e-old", school_id: S, student_id: "st1", class_group_id: "cg-old", status: "closed" },
      { id: "e-x", school_id: S, student_id: "st1", class_group_id: "cg-x", status: "cancelled" },
    ],
    class_subjects: [
      { id: "cs-now", school_id: S, class_group_id: "cg-now", subject_id: SUBJECT },
      { id: "cs-old", school_id: S, class_group_id: "cg-old", subject_id: SUBJECT },
      { id: "cs-x", school_id: S, class_group_id: "cg-x", subject_id: SUBJECT },
      { id: "cs-other", school_id: S, class_group_id: "cg-now", subject_id: "other" },
    ],
    siga_class_tasks: [
      task("t-returned"),
      task("t-open", { due_on: "2026-11-20" }),
      task("t-overdue"),
      task("t-old", { class_subject_id: "cs-old", status: "archived", due_on: "2025-05-01" }),
      task("t-cancelled", { class_subject_id: "cs-x" }),
      task("t-other", { class_subject_id: "cs-other" }),
    ],
    siga_class_task_submissions: [
      submission("t-returned", 1),
      submission("t-returned", 2, {
        status: "returned",
        grade: 15,
        feedback: "Bom",
        returned_at: "2026-11-02T10:00:00Z",
      }),
      submission("t-old", 1, { enrollment_id: "e-old", grade: 8, status: "submitted" }),
      // De outro aluno: nunca aparece.
      submission("t-open", 1, { enrollment_id: "e-someone" }),
    ],
  };
});

describe("trabalhos da disciplina (aluno e encarregado)", () => {
  it("todos os trabalhos da disciplina, também passados e arquivados; nada de outras", async () => {
    const work = await getMySubjectWork({ data: { subjectId: SUBJECT } });
    expect(work.subjectName).toBe("Matemática");
    expect(work.canSubmit).toBe(true);
    const ids = work.tasks.map((t) => t.id);
    // Atrasado, por entregar, entregue, devolvido.
    expect(ids).toEqual(["t-overdue", "t-open", "t-old", "t-returned"]);
    expect(ids).not.toContain("t-other");
    expect(ids).not.toContain("t-cancelled");
  });

  it("estado, tentativas e nota: o que pede acção vem primeiro", async () => {
    const work = await getMySubjectWork({ data: { subjectId: SUBJECT } });
    const byId = Object.fromEntries(work.tasks.map((t) => [t.id, t]));
    expect(work.tasks[0]!.id).toBe("t-overdue");
    expect(byId["t-overdue"]!.state).toBe("overdue");
    expect(byId["t-open"]!.state).toBe("open");
    expect(byId["t-open"]!.attempts).toEqual([]);
    expect(byId["t-returned"]).toMatchObject({
      state: "returned",
      latest: { attempt: 2, grade: 15, feedback: "Bom" },
    });
    expect(byId["t-returned"]!.attempts.map((a) => a.attempt)).toEqual([2, 1]);
    // Entregue mas não devolvido: a nota fica escondida.
    expect(byId["t-old"]).toMatchObject({ state: "submitted", archived: true });
    expect(byId["t-old"]!.latest?.grade).toBeNull();
    expect(work.summary).toEqual({ total: 4, delivered: 2, returned: 1, late: 0, average: 15 });
  });

  it("o encarregado vê o histórico do educando, mas não entrega", async () => {
    role = "Encarregado";
    const work = await getMySubjectWork({
      data: { subjectId: SUBJECT, studentId: "00000000-0000-0000-0000-0000000000c1" },
    });
    expect(work.canSubmit).toBe(false);
    expect(work.tasks).toHaveLength(4);
  });

  it("sem acesso ao aluno, ou disciplina de outra escola: vazio", async () => {
    visibleStudent = null;
    expect((await getMySubjectWork({ data: { subjectId: SUBJECT } })).tasks).toEqual([]);
    visibleStudent = "st1";
    tables.subjects = [];
    expect((await getMySubjectWork({ data: { subjectId: SUBJECT } })).subjectName).toBe("");
  });
});
