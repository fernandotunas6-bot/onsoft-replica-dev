import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  upsert: vi.fn(),
  remove: vi.fn(),
  audit: vi.fn(),
  target: vi.fn(),
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
  requireSgaWriter: async () => ({ schoolId: "AUDIT-A", appRole: "Administrador" }),
  resolveSgaMembershipAdmin: state.target,
}));
vi.mock("@/features/audit/record-audit", () => ({ recordAccessAudit: state.audit }));
const context = {
  userId: "AUDIT-admin",
  claims: { aal: "aal2", amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }] },
  supabase: {
    from: () => ({
      upsert: state.upsert,
      delete: () => {
        state.remove();
        const q = {
          eq: () => q,
          then: (fn: (value: unknown) => unknown) => Promise.resolve(fn({ error: null })),
        };
        return q;
      },
    }),
  },
};
const data = { userId: "AUDIT-staff", moduleKey: "pessoas", level: "Leitura" };
beforeEach(() => {
  vi.clearAllMocks();
  state.upsert.mockResolvedValue({ error: null });
  state.target.mockResolvedValue({ schoolId: "AUDIT-A", appRole: "Professor" });
});
describe("MFA nos endpoints de grants", () => {
  it("AAL1 recusa atribuir e repor antes de qualquer escrita", async () => {
    const { setStaffModuleGrant, clearStaffModuleGrant } = await import("@/features/access/grants");
    const args = { data, context: { ...context, claims: { aal: "aal1" } } };
    for (const fn of [setStaffModuleGrant, clearStaffModuleGrant]) {
      await expect((fn as unknown as (arg: unknown) => Promise<unknown>)(args)).rejects.toThrow(
        /2FA/,
      );
    }
    expect(state.upsert).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
  it("AAL2 atribui a pessoal da mesma escola e regista auditoria", async () => {
    const { setStaffModuleGrant } = await import("@/features/access/grants");
    await (setStaffModuleGrant as unknown as (arg: unknown) => Promise<unknown>)({ data, context });
    expect(state.upsert.mock.calls[0][0]).toMatchObject({
      school_id: "AUDIT-A",
      user_id: "AUDIT-staff",
      level: "Leitura",
    });
    expect(state.audit.mock.calls[0][0]).toMatchObject({
      schoolId: "AUDIT-A",
      action: "access.module_grant_set",
    });
  });
  it("nem AAL2 permite conceder a aluno ou conta de outra escola", async () => {
    const { setStaffModuleGrant } = await import("@/features/access/grants");
    for (const target of [
      { schoolId: "AUDIT-B", appRole: "Professor" },
      { schoolId: "AUDIT-A", appRole: "Aluno" },
    ]) {
      state.target.mockResolvedValueOnce(target);
      await expect(
        (setStaffModuleGrant as unknown as (arg: unknown) => Promise<unknown>)({ data, context }),
      ).rejects.toThrow();
    }
    expect(state.upsert).not.toHaveBeenCalled();
  });
});
