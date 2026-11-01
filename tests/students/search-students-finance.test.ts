import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * searchStudents: o resumo financeiro da lista de alunos (dívida, estado de pagamento)
 * não pode inventar dívidas nem dar propinas por regularizadas quando uma leitura do
 * Financeiro falha, e conta a multa por atraso como a página de Faturas.
 */

type Row = Record<string, unknown>;
const S = "00000000-0000-4000-8000-00000000000a";
let tables: Record<string, Row[]> = {};
let failures: Record<string, { code: string; message: string }> = {};

function memoryDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let from = 0;
      let to = Number.POSITIVE_INFINITY;
      const run = () => {
        if (failures[table]) return { data: null, error: failures[table] };
        const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        return { data: rows.slice(from, to + 1), error: null };
      };
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        neq: (column: string, value: unknown) => {
          filters.push((row) => row[column] !== value);
          return chain;
        },
        is: (column: string, value: unknown) => {
          filters.push((row) => (row[column] ?? null) === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        range: (start: number, end: number) => {
          from = start;
          to = end;
          return chain;
        },
        then: (resolve: (value: unknown) => unknown) => resolve(run()),
      };
      return chain;
    },
  };
}

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      parse: (input: unknown) => input,
      middleware: () => fn,
      validator: (parse: (input: unknown) => unknown) => {
        fn.parse = parse;
        return fn;
      },
      handler: (handler: (ctx: { data: unknown; context: Row }) => unknown) => (call: Row) =>
        handler({ data: fn.parse(call["data"]), context: { userId: "treasurer", supabase: {} } }),
    };
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadSgaAdminClient: async () => memoryDb(),
  resolveSgaMembershipAdmin: async () => ({ schoolId: S, appRole: "Tesouraria" }),
  requireSgaWriterFor: async () => ({ schoolId: S, appRole: "Tesouraria" }),
}));
vi.mock("@/features/students/student-scope", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadStudentScope: async () => ({ all: true, studentIds: [], personIds: [] }),
}));

const { searchStudents } = await import("@/features/students/server");
const search = () =>
  (searchStudents as unknown as (call: { data: Row }) => Promise<Row[]>)({
    data: { limit: 50, offset: 0 },
  });

beforeEach(() => {
  failures = {};
  tables = {
    students: [
      { id: "st1", school_id: S, person_id: "p1", student_number: "1260001", status: "active" },
    ],
    people: [{ id: "p1", school_id: S, full_name: "Ana Tchipa" }],
    enrollments: [
      {
        id: "e1",
        school_id: S,
        student_id: "st1",
        class_group_id: null,
        academic_year_id: null,
        status: "active",
        enrolled_on: "2026-09-01",
      },
    ],
    student_guardians: [],
    finance_contracts: [{ id: "c1", school_id: S, enrollment_id: "e1" }],
    finance_invoices: [
      {
        id: "i1",
        school_id: S,
        contract_id: "c1",
        amount: 10000,
        discount_amount: 0,
        penalty_amount: 1000,
        due_date: "2026-09-10",
        status: "partially_paid",
      },
    ],
    finance_receipts: [{ school_id: S, invoice_id: "i1", amount: 10000, status: "issued" }],
  };
});

describe("searchStudents — resumo financeiro da lista", () => {
  it("a multa por atraso conta para a dívida, como em Faturas", async () => {
    const [student] = await search();
    expect(student).toMatchObject({ debt_amount: 1000, has_debt: true, total_billed: 11000 });
  });

  it("um erro a ler os recibos não põe quem já pagou como devedor: a lista falha", async () => {
    failures.finance_receipts = { code: "57014", message: "canceling statement due to timeout" };
    await expect(search()).rejects.toThrow();
  });

  it("um erro a ler as faturas não dá as propinas por regularizadas", async () => {
    failures.finance_invoices = { code: "57014", message: "canceling statement due to timeout" };
    await expect(search()).rejects.toThrow();
  });

  it("sem as tabelas do Financeiro, a lista abre sem resumo financeiro", async () => {
    failures.finance_receipts = {
      code: "42P01",
      message: 'relation "finance_receipts" does not exist',
    };
    const [student] = await search();
    expect(student).toMatchObject({
      full_name: "Ana Tchipa",
      payment_status: null,
      debt_amount: 0,
    });
  });
});
