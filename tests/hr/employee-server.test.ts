import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Funcionários (`listHrEmployees`, `getHrEmployeeDetail`, `getTeacherHrEmployment`):
 * o guarda de leitura do RH (Administração e Tesouraria, salvo «Nenhum» no
 * Financeiro) e a escola activa em cada tabela lida.
 */

const mocks = vi.hoisted(() => ({
  membership: { schoolId: "school-a", appRole: "Tesouraria", allAppRoles: ["Tesouraria"] },
  blocked: false,
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
  assertModuleNotBlocked: async () => {
    if (mocks.blocked) throw new Error("Sem acesso ao módulo Financeiro.");
  },
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      const result = () => mocks.tables[table] ?? { data: [], error: null };
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
        is: (column: string, value: unknown) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          const { data, error } = result();
          return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
        },
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };
      return query;
    },
  }),
}));

import {
  getHrEmployeeDetail,
  getTeacherHrEmployment,
  listHrEmployees,
} from "@/features/hr/employee-server";

type Handler<T> = (args: {
  data?: Record<string, unknown>;
  context: { userId: string; supabase: unknown; claims: Record<string, unknown> };
}) => Promise<T>;
const call = <T>(fn: unknown, data?: Record<string, unknown>) =>
  (fn as Handler<T>)({ data, context: { userId: "user-a", supabase: {}, claims: {} } });

const VINCULO = "55555555-5555-4555-8555-555555555555";
const PROFESSOR = "66666666-6666-4666-8666-666666666666";

const employment = (over: Record<string, unknown> = {}) => ({
  id: VINCULO,
  person_id: "pessoa-rosa",
  employee_number: "F-012",
  employment_type: "permanent",
  status: "active",
  hire_date: "2024-09-01",
  termination_date: null,
  weekly_hours: 40,
  work_location: "Sede",
  position_id: "cargo-prof",
  department_id: "dep-ped",
  ...over,
});

const setRole = (appRole: string) => {
  mocks.membership = { schoolId: "school-a", appRole, allAppRoles: [appRole] };
};

beforeEach(() => {
  setRole("Tesouraria");
  mocks.blocked = false;
  mocks.filters = [];
  mocks.tables = {
    hr_employments: { data: [employment()], error: null },
    people: { data: [{ id: "pessoa-rosa", full_name: "Rosa Mateus" }], error: null },
    hr_positions: { data: [{ id: "cargo-prof", name: "Professora" }], error: null },
    hr_departments: { data: [{ id: "dep-ped", name: "Pedagógico" }], error: null },
    hr_contracts: {
      data: [
        {
          id: "c1",
          contract_number: "2024/12",
          contract_type: "permanent",
          salary_type: "monthly",
          base_salary_kz: 250000,
          hourly_rate_kz: null,
          lesson_hour_rate_kz: null,
          starts_on: "2024-09-01",
          ends_on: null,
          status: "active",
        },
      ],
      error: null,
    },
    hr_absence_events: {
      data: [
        {
          id: "f1",
          absence_date: "2026-10-02",
          absence_type: "unjustified",
          duration_minutes: 480,
          reason: null,
          validation_status: "pending",
        },
      ],
      error: null,
    },
    hr_payroll_items: {
      data: [
        {
          id: "r1",
          payroll_run_id: "folha-set",
          gross_amount_kz: 250000,
          deductions_kz: 20000,
          net_amount_kz: 230000,
        },
        {
          id: "r-outra",
          payroll_run_id: "folha-de-outra-escola",
          gross_amount_kz: 1,
          deductions_kz: 0,
          net_amount_kz: 1,
        },
      ],
      error: null,
    },
    hr_payroll_runs: {
      data: [{ id: "folha-set", competence_year: 2026, competence_month: 9, status: "paid" }],
      error: null,
    },
    teachers: { data: [{ id: PROFESSOR, person_id: "pessoa-rosa" }], error: null },
  };
});

const filtersOn = (table: string) => mocks.filters.filter(([name]) => name === table);

describe("listHrEmployees", () => {
  it("lista os vínculos da escola com o nome, o cargo e o departamento", async () => {
    const rows = await call<Awaited<ReturnType<typeof listHrEmployees>>>(listHrEmployees);
    expect(rows).toEqual([
      {
        id: VINCULO,
        personName: "Rosa Mateus",
        employeeNumber: "F-012",
        position: "Professora",
        department: "Pedagógico",
        employmentType: "permanent",
        status: "active",
        hireDate: "2024-09-01",
      },
    ]);
    for (const table of ["hr_employments", "people", "hr_positions", "hr_departments"]) {
      expect(filtersOn(table), table).toContainEqual([table, "school_id", "school-a"]);
    }
    expect(filtersOn("hr_employments")).toContainEqual(["hr_employments", "deleted_at", null]);
  });

  it("recusa quem não lê o RH, e «Nenhum» no Financeiro", async () => {
    setRole("Secretaria");
    await expect(call(listHrEmployees)).rejects.toThrow(/RH/);
    setRole("Tesouraria");
    mocks.blocked = true;
    await expect(call(listHrEmployees)).rejects.toThrow(/Financeiro/);
  });

  it("sem as tabelas do RH, a lista vem vazia", async () => {
    mocks.tables.hr_employments = {
      data: null,
      error: { code: "42P01", message: 'relation "hr_employments" does not exist' },
    };
    expect(await call(listHrEmployees)).toEqual([]);
  });
});

describe("getHrEmployeeDetail", () => {
  it("devolve o vínculo, os contratos, as faltas, os recibos e o professor da mesma pessoa", async () => {
    const detail = await call<Awaited<ReturnType<typeof getHrEmployeeDetail>>>(
      getHrEmployeeDetail,
      { employmentId: VINCULO },
    );
    expect(detail).toMatchObject({
      id: VINCULO,
      schoolId: "school-a",
      personName: "Rosa Mateus",
      position: "Professora",
      department: "Pedagógico",
      teacherId: PROFESSOR,
      contracts: [{ id: "c1", baseSalaryKz: 250000, status: "active" }],
      absences: [{ id: "f1", type: "unjustified", validationStatus: "pending" }],
    });
    // O recibo de uma folha que a escola não devolve fica de fora.
    expect(detail?.payslips).toEqual([
      {
        id: "r1",
        payrollRunId: "folha-set",
        competenceYear: 2026,
        competenceMonth: 9,
        runStatus: "paid",
        grossKz: 250000,
        deductionsKz: 20000,
        netKz: 230000,
      },
    ]);
    for (const table of [
      "hr_employments",
      "hr_contracts",
      "hr_absence_events",
      "hr_payroll_items",
      "hr_payroll_runs",
      "teachers",
      "people",
    ]) {
      expect(filtersOn(table), table).toContainEqual([table, "school_id", "school-a"]);
    }
    for (const table of ["hr_contracts", "hr_absence_events", "hr_payroll_items"]) {
      expect(filtersOn(table), table).toContainEqual([table, "employment_id", VINCULO]);
    }
  });

  it("um vínculo que a escola não devolve dá null", async () => {
    mocks.tables.hr_employments = { data: null, error: null };
    expect(await call(getHrEmployeeDetail, { employmentId: VINCULO })).toBeNull();
  });

  it("sem registo de professor, teacherId é null", async () => {
    mocks.tables.teachers = { data: [], error: null };
    const detail = await call<Awaited<ReturnType<typeof getHrEmployeeDetail>>>(
      getHrEmployeeDetail,
      { employmentId: VINCULO },
    );
    expect(detail?.teacherId).toBeNull();
  });

  it("a secretaria e o professor não lêem fichas de RH", async () => {
    for (const role of ["Secretaria", "Professor", "Encarregado"]) {
      setRole(role);
      await expect(call(getHrEmployeeDetail, { employmentId: VINCULO }), role).rejects.toThrow(
        /RH/,
      );
    }
  });
});

describe("getTeacherHrEmployment", () => {
  it("devolve o vínculo activo da pessoa do professor", async () => {
    setRole("Administrador");
    mocks.tables.hr_employments = {
      data: [
        employment({ id: "antigo", status: "terminated", hire_date: "2020-01-01" }),
        employment(),
      ],
      error: null,
    };
    expect(await call(getTeacherHrEmployment, { teacherId: PROFESSOR })).toEqual({
      employmentId: VINCULO,
    });
    expect(filtersOn("teachers")).toContainEqual(["teachers", "school_id", "school-a"]);
    expect(filtersOn("hr_employments")).toContainEqual([
      "hr_employments",
      "person_id",
      "pessoa-rosa",
    ]);
  });

  it("a quem não lê o RH devolve null, sem ler nada", async () => {
    setRole("Secretaria");
    expect(await call(getTeacherHrEmployment, { teacherId: PROFESSOR })).toBeNull();
    expect(mocks.filters).toEqual([]);
  });

  it("um professor sem vínculo devolve null", async () => {
    setRole("Administrador");
    mocks.tables.hr_employments = { data: [], error: null };
    expect(await call(getTeacherHrEmployment, { teacherId: PROFESSOR })).toBeNull();
  });
});
