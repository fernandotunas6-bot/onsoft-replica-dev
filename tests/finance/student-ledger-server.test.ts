import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  denied: false,
  fail: "",
  calls: [] as string[],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown;
    const builder = {
      middleware: () => builder,
      validator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (input: unknown) => unknown) => (input: { data: unknown }) =>
        fn({ data: validate(input.data), context: { userId: "user", supabase: {} } }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/server-error", () => ({
  publicDatabaseError: (_: unknown, message: string) => new Error(message),
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  requireSgaWriterFor: vi.fn(async () => {
    if (state.denied) throw new Error("Sem permissão");
    return { schoolId: "A" };
  }),
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      state.calls.push(table);
      const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
      let start = 0;
      let end = 999;
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          predicates.push((r) => r[key] === value);
          return builder;
        },
        neq: (key: string, value: unknown) => {
          predicates.push((r) => r[key] !== value);
          return builder;
        },
        in: (key: string, values: unknown[]) => {
          predicates.push((r) => values.includes(r[key]));
          return builder;
        },
        order: () => builder,
        range: (from: number, to: number) => {
          start = from;
          end = to;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              state.fail === table
                ? null
                : (state.tables[table] ?? [])
                    .filter((r) => predicates.every((p) => p(r)))
                    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
                    .slice(start, end + 1),
            error: state.fail === table ? { message: "erro" } : null,
          }).then(resolve),
      };
      return builder;
    },
  }),
}));
import { listStudentLedger } from "@/features/finance/student-ledger-server";
const year = "3f6b1c2e-6a1d-4c0b-9b51-0d6f3c8e2a11";
const load = () => listStudentLedger({ data: { academicYearId: year } });
beforeEach(() => {
  state.denied = false;
  state.fail = "";
  state.calls = [];
  state.tables = {
    enrollments: [
      {
        id: "e",
        school_id: "A",
        academic_year_id: year,
        student_id: "s",
        class_group_id: "g",
        status: "active",
        enrolled_on: "2026-01-01",
      },
      {
        id: "other-year",
        school_id: "A",
        academic_year_id: "old",
        student_id: "s",
        class_group_id: "g",
        status: "inactive",
        enrolled_on: "2025-01-01",
      },
      {
        id: "foreign",
        school_id: "B",
        academic_year_id: year,
        student_id: "foreign",
        status: "active",
      },
    ],
    students: [
      { id: "s", school_id: "A", person_id: "p", student_number: "0000001" },
      { id: "foreign", school_id: "B", person_id: "pB" },
    ],
    people: [
      { id: "p", school_id: "A", full_name: "Aluno A" },
      { id: "pB", school_id: "B", full_name: "Aluno B" },
    ],
    class_groups: [
      { id: "g", school_id: "A", academic_year_id: year, name: "10 A", grade_level_id: "grade" },
    ],
    grade_levels: [{ id: "grade", school_id: "A", name: "10ª", program_id: "program" }],
    programs: [{ id: "program", school_id: "A", name: "Informática", academic_level_id: "level" }],
    academic_levels: [{ id: "level", school_id: "A", name: "Secundário" }],
    finance_contracts: [
      { id: "c", school_id: "A", enrollment_id: "e" },
      { id: "old-c", school_id: "A", enrollment_id: "other-year" },
    ],
    finance_invoices: [
      {
        id: "i",
        school_id: "A",
        contract_id: "c",
        amount: 1200,
        discount_amount: 0,
        penalty_amount: 0,
        due_date: "2020-01-01",
        status: "open",
      },
      { id: "old-i", school_id: "A", contract_id: "old-c", amount: 9000, status: "open" },
    ],
    finance_receipts: [],
  };
});
describe("lista financeira no servidor (base simulada)", () => {
  it("isola escola e ano, resolve turma → classe → curso → nível", async () => {
    const rows = await load();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Aluno A",
      className: "10 A",
      programName: "Informática",
      levelName: "Secundário",
      outstanding: 1200,
    });
  });
  it("inclui recibos para além de 1000 linhas sem inventar dívida", async () => {
    state.tables.finance_receipts = Array.from({ length: 1200 }, (_, i) => ({
      id: `r${String(i).padStart(4, "0")}`,
      school_id: "A",
      invoice_id: "i",
      amount: 1,
      status: "issued",
    }));
    expect((await load())[0]).toMatchObject({ paid: 1200, outstanding: 0, overdue: 0 });
  });
  it("mantém o aluno sem contrato/factura na lista", async () => {
    state.tables.finance_contracts = [];
    expect((await load())[0]).toMatchObject({ invoiceCount: 0, billed: 0, paid: 0 });
    expect(state.calls).not.toContain("finance_receipts");
  });
  it("erro nos recibos bloqueia totais parciais", async () => {
    state.fail = "finance_receipts";
    await expect(load()).rejects.toThrow("Não foi possível carregar");
  });
  it("sem permissão financeira não consulta dados", async () => {
    state.denied = true;
    await expect(load()).rejects.toThrow("Sem permissão");
    expect(state.calls).toEqual([]);
  });
});
