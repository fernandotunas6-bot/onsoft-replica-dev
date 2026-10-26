import { beforeEach, describe, expect, it, vi } from "vitest";
let failedTable = "";
const db = {
  from(table: string) {
    const result = () => ({
      data: [],
      count: 0,
      error: table === failedTable ? { message: "timeout" } : null,
    });
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      not: () => chain,
      gte: () => chain,
      order: () => chain,
      range: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        ...result(),
        data: table === "academic_years" ? { id: "year", name: "2026", status: "active" } : null,
      }),
      then: (resolve: (value: unknown) => unknown) => resolve(result()),
    };
    return chain;
  },
};
vi.mock("@/integrations/supabase/sga-admin", () => ({
  requireSgaWriterFor: async () => ({ schoolId: "school" }),
  loadSgaAdminClient: async () => db,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (fn: (ctx: unknown) => unknown) => () =>
        fn({ data: {}, context: { userId: "actor", supabase: {} } }),
    };
    return chain;
  },
}));
const { getAcademicStructureStatus } = await import("@/features/academic/academic-structure");
beforeEach(() => {
  failedTable = "";
});
describe("estrutura académica: erro não é ausência de configuração", () => {
  it("conserva zero para uma consulta bem sucedida sem registos", async () => {
    expect(await getAcademicStructureStatus()).toMatchObject({
      subjects: 0,
      activeRuleSets: 0,
      classGroups: 0,
    });
  });
  for (const table of [
    "academic_years",
    "class_groups",
    "assessment_rule_sets",
    "terms",
    "gradebooks",
    "grade_sheets",
    "siga_exam_sessions",
  ]) {
    it(`propaga falha de ${table}`, async () => {
      failedTable = table;
      await expect(getAcademicStructureStatus()).rejects.toThrow();
    });
  }
});
