import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { from: vi.fn() },
  load: vi.fn(),
  grant: vi.fn(),
  membership: { schoolId: "school-a", appRole: "Administrador" },
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
  loadSgaAdminClient: () => mocks.load(),
  assertModuleNotBlocked: (...args: unknown[]) => mocks.grant(...args),
}));
vi.mock("@/integrations/supabase/server-error", () => ({
  publicDatabaseError: (_error: unknown, fallback: string) => new Error(fallback),
}));
import { reviewHrAbsence } from "@/features/hr/absences";

type Handler = (args: {
  data: { absenceId: string; absenceType: string; decision: string; reason: string };
  context: { userId: string; claims: Record<string, unknown> };
}) => Promise<{ saved: boolean }>;
const review = (decision = "validate", aal = "aal2") =>
  (reviewHrAbsence as unknown as Handler)({
    data: {
      absenceId: "absence-a",
      absenceType: "unjustified",
      decision,
      reason: "Sem justificação",
    },
    context: { userId: "user-a", claims: { aal } },
  });
let current: { id: string; validation_status: string } | null;
let updated: { id: string } | null;
let writeError: { code: string } | null;
let filters: Array<[string, string, unknown]>;
let payload: Record<string, unknown> | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.grant.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue(mocks.db);
  current = { id: "absence-a", validation_status: "pending" };
  updated = { id: "absence-a" };
  writeError = null;
  filters = [];
  payload = undefined;
  mocks.db.from.mockImplementation(() => {
    let updating = false;
    const result = () => ({
      data: updating ? updated : current,
      error: updating ? writeError : null,
    });
    const query = {
      select: () => query,
      update: (values: Record<string, unknown>) => {
        updating = true;
        payload = values;
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push([updating ? "write" : "read", column, value]);
        return query;
      },
      is: (column: string, value: unknown) => {
        filters.push([updating ? "write" : "read", column, value]);
        return query;
      },
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => resolve(result()),
    };
    return query;
  });
});

describe("absence review", () => {
  it.each(["validate", "reject"])("confirms a persisted %s decision", async (decision) => {
    expect(await review(decision)).toEqual({ saved: true });
    expect(payload).toMatchObject({
      validation_status: decision === "validate" ? "validated" : "rejected",
      validated_by: "user-a",
      updated_by: "user-a",
    });
    expect(mocks.grant).toHaveBeenCalledWith("school-a", "user-a", "financeiro", "write");
    expect(filters).toContainEqual(["write", "school_id", "school-a"]);
    expect(filters).toContainEqual(["write", "id", "absence-a"]);
    expect(filters).toContainEqual(["write", "validation_status", "pending"]);
    expect(filters).toContainEqual(["write", "deleted_at", null]);
  });

  it("reports a concurrent decision or removal instead of false success", async () => {
    updated = null;
    await expect(review()).rejects.toThrow(/alterada|removida/i);
  });

  it("requires MFA before loading the privileged client", async () => {
    await expect(review("validate", "aal1")).rejects.toThrow(/2FA/);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(payload).toBeUndefined();
  });

  it("preserves already reviewed decisions", async () => {
    current = { id: "absence-a", validation_status: "validated" };
    await expect(review()).rejects.toThrow(/já foi revista/);
    expect(payload).toBeUndefined();
  });

  it("refuses absent or inaccessible records", async () => {
    current = null;
    await expect(review()).rejects.toThrow("Falta não encontrada.");
    expect(payload).toBeUndefined();
  });

  it("reports database errors instead of saved", async () => {
    writeError = { code: "XX000" };
    await expect(review()).rejects.toThrow("Não foi possível guardar a decisão da falta.");
  });

  it("enforces module authorization before financial access", async () => {
    mocks.grant.mockRejectedValue(new Error("Módulo em leitura"));
    await expect(review()).rejects.toThrow("Módulo em leitura");
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
