import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClassTaskList, type ClassTaskRow } from "@/features/academic/class-tasks";

/**
 * Trabalhos da turma (menu da turma e da disciplina): a lista junta as tarefas
 * que os professores publicam no detalhe da aula, e o servidor só devolve as das
 * disciplinas que a conta pode ver.
 */

const mocks = vi.hoisted(() => ({
  membership: { schoolId: "school-a", appRole: "Administrador", allAppRoles: ["Administrador"] },
  ownTeacher: null as string | null,
  guard: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  filters: [] as Array<[string, string, unknown]>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => mocks.membership,
  requireSgaWriterFor: async (...args: unknown[]) => {
    mocks.guard(...args);
    return mocks.membership;
  },
  requireSgaWriterForWrite: async () => mocks.membership,
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        in: (column: string, value: unknown) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          resolve(mocks.tables[table] ?? { data: [], error: null }),
      };
      return query;
    },
  }),
}));
vi.mock("@/features/academic/own-teacher", () => ({ ownTeacherId: async () => mocks.ownTeacher }));
vi.mock("@/features/calendar/dates", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  todayInLuanda: () => "2026-10-25",
}));

import { listClassTasks } from "@/features/academic/timetable-lessons";

type Handler = (args: {
  data: Record<string, unknown>;
  context: { userId: string; supabase: unknown };
}) => Promise<Awaited<ReturnType<typeof listClassTasks>>>;
const run = (data: Record<string, unknown>) =>
  (listClassTasks as unknown as Handler)({ data, context: { userId: "user-a", supabase: {} } });

const TURMA = "11111111-1111-4111-8111-111111111111";
const MAT = "22222222-2222-4222-8222-222222222222";

const row = (over: Partial<ClassTaskRow>): ClassTaskRow => ({
  id: "t",
  class_subject_id: "cs-mat",
  kind: "tpc",
  title: "Tarefa",
  description: null,
  due_on: null,
  created_at: null,
  ...over,
});

describe("buildClassTaskList", () => {
  const offerings = new Map([
    ["cs-mat", { subjectId: "mat", subjectName: "Matemática" }],
    ["cs-lp", { subjectId: "lp", subjectName: "Língua Portuguesa" }],
  ]);

  it("separa as abertas (prazo mais próximo primeiro, sem prazo no fim) das de prazo terminado", () => {
    const list = buildClassTaskList(
      [
        row({ id: "sem-prazo", title: "Leitura" }),
        row({ id: "longe", due_on: "2026-11-10" }),
        row({ id: "hoje", due_on: "2026-10-25", class_subject_id: "cs-lp" }),
        row({ id: "antiga", due_on: "2026-09-01" }),
        row({ id: "ontem", due_on: "2026-10-24" }),
      ],
      offerings,
      "2026-10-25",
    );
    expect(list.open.map((t) => t.id)).toEqual(["hoje", "longe", "sem-prazo"]);
    expect(list.closed.map((t) => t.id)).toEqual(["ontem", "antiga"]);
    expect(list.open[0]).toMatchObject({ subjectId: "lp", subjectName: "Língua Portuguesa" });
  });

  it("deixa de fora uma tarefa de uma disciplina que não está na lista", () => {
    const list = buildClassTaskList(
      [row({ class_subject_id: "cs-outra" })],
      offerings,
      "2026-10-25",
    );
    expect(list.open).toEqual([]);
    expect(list.closed).toEqual([]);
  });
});

describe("listClassTasks", () => {
  beforeEach(() => {
    mocks.membership = {
      schoolId: "school-a",
      appRole: "Administrador",
      allAppRoles: ["Administrador"],
    };
    mocks.ownTeacher = null;
    mocks.guard.mockClear();
    mocks.filters = [];
    mocks.tables = {
      class_subjects: { data: [{ id: "cs-mat", subject_id: MAT }], error: null },
      siga_class_tasks: {
        data: [
          {
            id: "t1",
            class_subject_id: "cs-mat",
            kind: "trabalho",
            title: "Frações",
            description: null,
            due_on: "2026-10-30",
            created_at: null,
          },
        ],
        error: null,
      },
      subjects: { data: [{ id: MAT, name: "Matemática" }], error: null },
    };
  });

  it("passa pela guarda do Pedagógico e lê só a turma pedida, na escola da conta", async () => {
    const list = await run({ classGroupId: TURMA });
    expect(mocks.guard).toHaveBeenCalledWith("pedagogica", {}, "user-a", [
      "Administrador",
      "Secretaria",
      "Professor",
    ]);
    expect(mocks.filters).toContainEqual(["class_subjects", "school_id", "school-a"]);
    expect(mocks.filters).toContainEqual(["class_subjects", "class_group_id", TURMA]);
    expect(mocks.filters).toContainEqual(["siga_class_tasks", "school_id", "school-a"]);
    expect(mocks.filters).toContainEqual(["siga_class_tasks", "status", "published"]);
    expect(mocks.filters).not.toContainEqual(expect.arrayContaining(["teacher_id"]));
    expect(list.open).toMatchObject([{ id: "t1", subjectName: "Matemática" }]);
  });

  it("com disciplina, filtra as disciplinas da turma por ela", async () => {
    await run({ classGroupId: TURMA, subjectId: MAT });
    expect(mocks.filters).toContainEqual(["class_subjects", "subject_id", MAT]);
  });

  it("o professor só vê os trabalhos das disciplinas que lecciona", async () => {
    mocks.membership = { schoolId: "school-a", appRole: "Professor", allAppRoles: ["Professor"] };
    mocks.ownTeacher = "teacher-1";
    await run({ classGroupId: TURMA });
    expect(mocks.filters).toContainEqual(["class_subjects", "teacher_id", "teacher-1"]);
  });

  it("um professor sem ficha de docente na escola não recebe nada", async () => {
    mocks.membership = { schoolId: "school-a", appRole: "Professor", allAppRoles: ["Professor"] };
    const list = await run({ classGroupId: TURMA });
    expect(list).toEqual({ available: true, open: [], closed: [] });
    expect(mocks.filters.some(([table]) => table === "siga_class_tasks")).toBe(false);
  });

  it("sem a tabela das tarefas devolve available: false", async () => {
    mocks.tables.siga_class_tasks = {
      data: null,
      error: { message: 'relation "siga_class_tasks" does not exist' },
    };
    const list = await run({ classGroupId: TURMA });
    expect(list.available).toBe(false);
  });
});
