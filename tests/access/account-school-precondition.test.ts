import { beforeEach, describe, expect, it, vi } from "vitest";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const TARGET = "00000000-0000-4000-8000-000000000003";
const m = vi.hoisted(() => ({
  membership: null as { schoolId: string; appRole: string } | null,
  from: vi.fn(),
  authUpdate: vi.fn(),
  getUser: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      parse: (value: unknown): unknown => value,
      middleware: () => fn,
      validator: (parse: (value: unknown) => unknown) => {
        fn.parse = parse;
        return fn;
      },
      handler: (handler: (input: unknown) => unknown) => (call: { data: unknown }) =>
        handler({
          data: fn.parse(call.data),
          context: { userId: "00000000-0000-4000-8000-000000000004", supabase: {}, claims: {} },
        }),
    };
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => m.membership,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => m.from(...args),
    auth: { admin: { updateUserById: m.authUpdate, getUserById: m.getUser } },
  },
}));
vi.mock("@/integrations/supabase/sga", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/supabase/sga")>()),
  sgaClient: (client: unknown) => client,
}));
vi.mock("@/features/people/server", () => ({ ensureTeacherHrRecord: vi.fn() }));
vi.mock("@/features/audit/record-audit", () => ({ recordAccessAudit: m.audit }));
vi.mock("@/lib/step-up", () => ({ requireRecentVerification: vi.fn() }));

const { setSystemAccountDisabled } = await import("@/features/access/server");
const { setAccountDisabledInputSchema } = await import("@/features/access/schemas");
beforeEach(() => {
  vi.clearAllMocks();
  m.membership = { schoolId: A, appRole: "Administrador" };
  m.getUser.mockResolvedValue({
    data: { user: { app_metadata: {}, banned_until: null } },
    error: null,
  });
  // Uma sentinela distingue a precondição da restante operação, sem mutações.
  m.from.mockImplementation(() => {
    throw new Error("CONTEXTO_CONFIRMADO_ANTES_DA_BASE");
  });
});
function allowDatabase(updateResult: object | null) {
  const updates: Record<string, unknown>[] = [];
  m.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    let updating = false;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      in: () => query,
      update: () => {
        updating = true;
        return query;
      },
      maybeSingle: async () => {
        if (updating) {
          updates.push({ ...filters });
          return { data: updateResult, error: null };
        }
        return {
          data: table === "profiles" ? { cargo: "Professor" } : { id: "membership-a" },
          error: null,
        };
      },
      then: (resolve: (value: unknown) => unknown) =>
        resolve({
          data:
            table === "school_memberships"
              ? [
                  { id: "membership-a", school_id: A, status: "active" },
                  { id: "membership-b", school_id: B, status: "active" },
                ]
              : [{ roles: { code: "teacher" } }],
          error: null,
        }),
    };
    return query;
  });
  return updates;
}

describe("suspensão: escola esperada é precondição, não autorização", () => {
  it("confirma a escrita pelo vínculo, escola e utilizador antes de anunciar sucesso", async () => {
    const updates = allowDatabase({ id: "membership-a" });
    await expect(
      setSystemAccountDisabled({ data: { userId: TARGET, disabled: true, expectedSchoolId: A } }),
    ).resolves.toEqual({ id: TARGET, disabled: true, notice: null });
    expect(updates).toEqual([{ id: "membership-a", school_id: A, user_id: TARGET }]);
    expect(m.authUpdate).not.toHaveBeenCalled(); // A conta mantém acesso à escola B.
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: A, action: "access.account_disabled" }),
    );
  });
  it("zero linhas alteradas não permite bloqueio global nem auditoria de sucesso", async () => {
    allowDatabase(null);
    await expect(
      setSystemAccountDisabled({ data: { userId: TARGET, disabled: true, expectedSchoolId: A } }),
    ).rejects.toThrow("O vínculo da conta mudou");
    expect(m.authUpdate).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it.each([
    [A, B],
    [B, A],
  ])(
    "recusa escola actual %s diferente da esperada %s antes de consultar contas",
    async (actual, expected) => {
      m.membership = { schoolId: actual, appRole: "Administrador" };
      await expect(
        setSystemAccountDisabled({
          data: { userId: TARGET, disabled: true, expectedSchoolId: expected },
        }),
      ).rejects.toThrow("A escola activa mudou");
      expect(m.from).not.toHaveBeenCalled();
      expect(m.authUpdate).not.toHaveBeenCalled();
      expect(m.audit).not.toHaveBeenCalled();
    },
  );
  it("contexto coincidente continua pelas validações normais, sem seleccionar outra escola", async () => {
    await expect(
      setSystemAccountDisabled({ data: { userId: TARGET, disabled: true, expectedSchoolId: A } }),
    ).rejects.toThrow("CONTEXTO_CONFIRMADO_ANTES_DA_BASE");
    expect(m.from).toHaveBeenCalledWith("profiles");
  });
  it("preserva clientes legados sem precondição explícita", async () => {
    await expect(
      setSystemAccountDisabled({ data: { userId: TARGET, disabled: false } }),
    ).rejects.toThrow("CONTEXTO_CONFIRMADO_ANTES_DA_BASE");
  });
  it("indicar uma escola não substitui vínculo e papel autorizados", async () => {
    m.membership = null;
    await expect(
      setSystemAccountDisabled({ data: { userId: TARGET, disabled: true, expectedSchoolId: A } }),
    ).rejects.toThrow("determinar a escola");
    m.membership = { schoolId: A, appRole: "Professor" };
    await expect(
      setSystemAccountDisabled({ data: { userId: TARGET, disabled: true, expectedSchoolId: A } }),
    ).rejects.toThrow("gestão de acessos");
    expect(m.from).not.toHaveBeenCalled();
  });
  it("recusa precondições malformadas em vez de as ignorar", () => {
    expect(
      setAccountDisabledInputSchema.safeParse({
        userId: TARGET,
        disabled: true,
        expectedSchoolId: "escola-A",
      }).success,
    ).toBe(false);
    expect(
      setAccountDisabledInputSchema.safeParse({ userId: TARGET, disabled: true }).success,
    ).toBe(true);
  });
});
