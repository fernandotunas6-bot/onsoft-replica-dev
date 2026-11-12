import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `assignStaffPosition`: o índice único de hr_positions (school_id, lower(name))
 * também abrange cargos inactivos. Um nome repetido não pode chegar à base de
 * dados como inserção nova, e falhas de leitura não podem passar por «sem cargo».
 */

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  inserts: [] as Array<[string, unknown]>,
  insertResults: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
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
  requireSgaWriterFor: async () => ({ schoolId: "school-a", appRole: "Administrador" }),
  requireSgaWriterForWrite: async () => ({ schoolId: "school-a", appRole: "Administrador" }),
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      const result = () => mocks.tables[table] ?? { data: [], error: null };
      let inserting = false;
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        is: () => query,
        order: () => query,
        limit: () => query,
        update: () => query,
        insert: (row: unknown) => {
          mocks.inserts.push([table, row]);
          inserting = true;
          return query;
        },
        single: async () => {
          if (inserting) {
            return mocks.insertResults[table]?.shift() ?? { data: { id: "new-id" }, error: null };
          }
          const { data, error } = result();
          return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
        },
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

const { assignStaffPosition, ensureStaffEmploymentDraft } =
  await import("@/features/hr/staff-positions-server");
const assign = assignStaffPosition as unknown as (input: {
  data: Record<string, unknown>;
  context: { userId: string; supabase: unknown };
}) => Promise<{ positionId: string }>;

const personId = "00000000-0000-4000-8000-000000000010";
const context = { userId: "user-admin", supabase: {} };

beforeEach(() => {
  mocks.inserts = [];
  mocks.insertResults = {};
  mocks.tables = {
    people: { data: { id: personId }, error: null },
    hr_employments: { data: [{ id: "emp-1", status: "draft" }], error: null },
    person_roles: { data: { id: "role-1", active: true }, error: null },
  };
});

describe("assignStaffPosition — cargo novo", () => {
  it("recusa reutilizar em silêncio um cargo inactivo com o mesmo nome e não tenta inserir", async () => {
    mocks.tables.hr_positions = {
      data: [{ id: "pos-old", name: "Contabilista", department_id: null, active: false }],
      error: null,
    };
    await expect(
      assign({ data: { personId, newPositionName: "contabilista" }, context }),
    ).rejects.toThrow(/cargo inactivo/);
    expect(mocks.inserts.filter(([table]) => table === "hr_positions")).toHaveLength(0);
  });

  it("reutiliza o cargo activo com o mesmo nome, sem distinguir maiúsculas", async () => {
    mocks.tables.hr_positions = {
      data: [{ id: "pos-1", name: "Contabilista", department_id: null, active: true }],
      error: null,
    };
    const result = await assign({ data: { personId, newPositionName: "CONTABILISTA" }, context });
    expect(result.positionId).toBe("pos-1");
    expect(mocks.inserts.filter(([table]) => table === "hr_positions")).toHaveLength(0);
  });

  it("uma falha a ler os cargos não é tratada como «nenhum cargo» nem cria duplicado", async () => {
    mocks.tables.hr_positions = { data: null, error: { code: "57014", message: "timeout" } };
    await expect(
      assign({ data: { personId, newPositionName: "Contabilista" }, context }),
    ).rejects.toThrow();
    expect(mocks.inserts.filter(([table]) => table === "hr_positions")).toHaveLength(0);
  });

  it("uma falha a ler o departamento não é tratada como departamento inválido", async () => {
    mocks.tables.hr_departments = { data: null, error: { code: "57014", message: "timeout" } };
    await expect(
      assign({
        data: {
          personId,
          positionId: "00000000-0000-4000-8000-000000000020",
          departmentId: "00000000-0000-4000-8000-000000000030",
        },
        context,
      }),
    ).rejects.not.toThrow(/Departamento inválido/);
  });
});

describe("ensureStaffEmploymentDraft — concorrência", () => {
  function dbWith(reads: Array<{ data: unknown; error: unknown }>, insertError: unknown) {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      order: () => query,
      insert: () => query,
      single: async () => ({ data: null, error: insertError }),
      then: (resolve: (value: unknown) => unknown) => resolve(reads.shift()),
    };
    return { from: () => query } as unknown as Parameters<typeof ensureStaffEmploymentDraft>[0];
  }

  it("se o índice recusar a ficha duplicada, devolve a ficha criada pelo outro pedido", async () => {
    const db = dbWith(
      [
        { data: [], error: null },
        { data: [{ id: "emp-other", status: "draft" }], error: null },
      ],
      { code: "23505", message: "duplicate key value" },
    );
    await expect(ensureStaffEmploymentDraft(db, "school-a", personId, "actor")).resolves.toEqual({
      id: "emp-other",
      created: false,
    });
  });

  it("outra falha na criação continua a ser um erro", async () => {
    const db = dbWith([{ data: [], error: null }], { code: "23503", message: "fk" });
    await expect(ensureStaffEmploymentDraft(db, "school-a", personId, "actor")).rejects.toThrow();
  });
});
