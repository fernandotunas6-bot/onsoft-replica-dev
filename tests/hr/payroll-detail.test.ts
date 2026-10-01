import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  membership: { schoolId: "school-a", appRole: "Administrador" },
  db: { from: vi.fn() },
  grant: vi.fn(),
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
  loadSgaAdminClient: async () => mocks.db,
  assertModuleNotBlocked: (...args: unknown[]) => mocks.grant(...args),
}));
vi.mock("@/integrations/supabase/server-error", () => ({
  publicDatabaseError: (_error: unknown, fallback: string) => new Error(fallback),
}));
import { getPayrollRunDetail } from "@/features/hr/payroll";
import type { Json } from "@/integrations/supabase/types";

type Handler = (args: { data: { payrollRunId: string }; context: { userId: string } }) => Promise<{
  items: Array<{
    salaryType: string | null;
    remunerationModel: string | null;
    calculationDetails: Record<string, Json>;
  }>;
} | null>;
const readDetail = () =>
  (getPayrollRunDetail as unknown as Handler)({
    data: { payrollRunId: "run-a" },
    context: { userId: "user-a" },
  });
let details: Json;
let run: Record<string, unknown> | null;
let itemError: { code: string } | null;
let filters: Array<[string, string, unknown]>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.grant.mockResolvedValue(undefined);
  details = { salary_type: "monthly", remuneration_model: "fixed_deduct_absence" };
  run = { id: "run-a", status: "paid" };
  itemError = null;
  filters = [];
  mocks.db.from.mockImplementation((table: string) => {
    const data = () => {
      if (table === "hr_payroll_runs") return run;
      if (table === "hr_payroll_items")
        return [
          {
            id: "item-a",
            employment_id: "employment-a",
            contract_id: "contract-a",
            calculation_details: details,
          },
        ];
      if (table === "hr_employments") return [{ id: "employment-a", person_id: "person-a" }];
      if (table === "people") return [{ id: "person-a", full_name: "Professor" }];
      if (table === "hr_contracts") return [{ id: "contract-a", salary_type: "hourly" }];
      if (table === "hr_contract_remuneration_policies")
        return [{ contract_id: "contract-a", remuneration_model: "validated_units" }];
      throw new Error(`Unexpected table: ${table}`);
    };
    const result = () => ({ data: data(), error: table === "hr_payroll_items" ? itemError : null });
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([table, column, value]);
        return query;
      },
      in: () => query,
      order: () => query,
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => resolve(result()),
    };
    return query;
  });
});

describe("historical payroll detail", () => {
  it("uses the calculation snapshot even after contract and policy changes", async () => {
    const result = await readDetail();
    expect(result?.items[0]).toMatchObject({
      salaryType: "monthly",
      remunerationModel: "fixed_deduct_absence",
      calculationDetails: details,
    });
    expect(mocks.db.from).not.toHaveBeenCalledWith("hr_contracts");
    expect(mocks.db.from).not.toHaveBeenCalledWith("hr_contract_remuneration_policies");
  });

  it.each(
    [{}, null, [], "legacy", { salary_type: 42, remuneration_model: false }].map((snapshot) => [
      snapshot,
    ]),
  )("does not invent historical salary metadata for snapshot %j", async (snapshot) => {
    details = snapshot;
    const result = await readDetail();
    expect(result?.items[0]).toMatchObject({ salaryType: null, remunerationModel: null });
    expect(Array.isArray(result?.items[0].calculationDetails)).toBe(false);
  });

  it("scopes every lookup to the authorized school", async () => {
    await readDetail();
    expect(mocks.grant).toHaveBeenCalledWith("school-a", "user-a", "financeiro", "read");
    for (const [table] of mocks.db.from.mock.calls) {
      expect(filters).toContainEqual([table, "school_id", "school-a"]);
    }
  });

  it("does not load payroll items for a missing or inaccessible run", async () => {
    run = null;
    expect(await readDetail()).toBeNull();
    expect(mocks.db.from).not.toHaveBeenCalledWith("hr_payroll_items");
  });

  it("reports item read errors instead of returning an empty payroll", async () => {
    itemError = { code: "XX000" };
    await expect(readDetail()).rejects.toThrow("Não foi possível carregar os itens da folha.");
  });

  it("does not load financial data when module access is blocked", async () => {
    mocks.grant.mockRejectedValue(new Error("Módulo bloqueado"));
    await expect(readDetail()).rejects.toThrow("Módulo bloqueado");
    expect(mocks.db.from).not.toHaveBeenCalled();
  });
});
