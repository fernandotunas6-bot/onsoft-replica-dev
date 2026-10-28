import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  writer: vi.fn(),
  calls: [] as string[],
  tables: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const b = {
      middleware: () => b,
      validator: (fn: typeof validate) => {
        validate = fn;
        return b;
      },
      handler: (fn: (arg: unknown) => unknown) => (arg: { data: unknown; context?: unknown }) =>
        fn({ ...arg, data: validate(arg.data) }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  requireSgaWriterFor: state.writer,
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      state.calls.push(table);
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      let limit = Infinity;
      const includes = (value: unknown, pattern: string) =>
        String(value ?? "")
          .toLowerCase()
          .includes(pattern.replaceAll("%", "").toLowerCase());
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push((r) =>
            k === "students.school_id"
              ? (state.tables.students ?? []).some(
                  (student) => student.person_id === r.id && student.school_id === v,
                )
              : r[k] === v,
          );
          return q;
        },
        is: (k: string, v: unknown) => {
          filters.push((r) => (r[k] ?? null) === v);
          return q;
        },
        in: (k: string, vs: unknown[]) => {
          filters.push((r) => vs.includes(r[k]));
          return q;
        },
        ilike: (k: string, p: string) => {
          filters.push((r) => includes(r[k], p));
          return q;
        },
        or: (s: string) => {
          filters.push((r) =>
            s.split(",").some((x) => {
              const [k, p] = x.split(".ilike.");
              return includes(r[k], p);
            }),
          );
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          limit = n;
          return q;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: (state.tables[table] ?? [])
              .filter((r) => filters.every((f) => f(r)))
              .slice(0, limit),
            error: null,
          }).then(resolve),
      };
      return q;
    },
  }),
}));
const { searchEnrollmentStudents } = await import("@/features/students/enrollment-student-search");
const search = async (query: string, context: unknown = { userId: "secretaria", supabase: {} }) =>
  (searchEnrollmentStudents as unknown as (args: unknown) => Promise<Record<string, unknown>[]>)({
    data: { query },
    context,
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.calls = [];
  state.writer.mockResolvedValue({ schoolId: "school-a" });
  state.tables = {
    people: [
      { id: "p1", school_id: "school-a", full_name: "Ana Maria", national_id: "123456789AB001" },
      { id: "p2", school_id: "school-b", full_name: "Ana Externa", national_id: "123456789AB002" },
    ],
    students: [
      {
        id: "s1",
        person_id: "p1",
        school_id: "school-a",
        student_number: "1260001",
        status: "active",
      },
      {
        id: "s2",
        person_id: "p2",
        school_id: "school-b",
        student_number: "1260002",
        status: "active",
      },
    ],
  };
});
describe("Pesquisa escolar para matrícula", () => {
  it("encontra por nome e não devolve alunos de outra escola", async () => {
    expect(await search("Ana")).toEqual([
      {
        id: "s1",
        full_name: "Ana Maria",
        registration_number: "1260001",
        student_status: "active",
      },
    ]);
    expect(new Set(state.calls)).toEqual(new Set(["people", "students"]));
  });
  it("encontra por BI e por número, sem expor o BI", async () => {
    expect((await search("123456789AB001"))[0]?.id).toBe("s1");
    expect((await search("1260001"))[0]?.full_name).toBe("Ana Maria");
    expect(JSON.stringify(await search("1260001"))).not.toContain("123456789AB001");
  });
  it("sem sessão ou permissão não consulta a base", async () => {
    await expect(search("Ana", null)).rejects.toThrow("Sessão inválida");
    expect(state.calls).toEqual([]);
    state.writer.mockRejectedValueOnce(new Error("Sem permissão"));
    await expect(search("Ana")).rejects.toThrow("Sem permissão");
    expect(state.calls).toEqual([]);
  });
  it("recusa pesquisa curta e não interpreta sintaxe de filtros", async () => {
    await expect(search("A")).rejects.toThrow();
    expect(state.calls).toEqual([]);
    expect(await search("%,()")).toEqual([]);
    expect(state.calls).toEqual([]);
  });
});
