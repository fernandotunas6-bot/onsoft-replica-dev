import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ insert: vi.fn(), allowed: vi.fn(), write: vi.fn(), limit: vi.fn() }));
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
        handler({ data: fn.parse(call.data), context: { userId: "teacher" } }),
    };
    return fn;
  },
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => ({ schoolId: "school-a", appRole: "Professor" }),
  assertTenantAllowsWrites: vi.fn(),
  requireSgaWriterForWrite: (...args: unknown[]) => m.write(...args),
  loadSgaAdminClient: async () => ({ from: () => ({ insert: m.insert }) }),
}));
vi.mock("@/features/auth/server", () => ({
  resolveUserLinkedEntities: async () => ({ teacher_id: "teacher-a" }),
}));
vi.mock("@/features/students/student-scope", () => ({
  resolveVerifiedAccountEmail: async () => null,
  teacherClassGroupIds: (...args: unknown[]) => m.allowed(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => true,
  isRateLimitBypassed: () => false,
  recordRateLimitAttempt: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/shared-rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => m.limit(...args),
}));
const { registerIssuedDocument } = await import("@/features/documents/verification");
const CLASS = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const data = {
  title: "Pauta disciplinar",
  templateKey: "pauta-disciplinar",
  classGroupIds: [CLASS],
};
beforeEach(() => {
  vi.clearAllMocks();
  m.allowed.mockResolvedValue([CLASS]);
  m.limit.mockResolvedValue(true);
  // Como o guarda real: sem lista de cargos só aceita Administrador, Secretaria
  // e Tesouraria (parseWriterArgs); o professor tem de estar na lista.
  m.write.mockImplementation(async (_module: string, _userId: string, roles?: string[]) => {
    const allowed = roles ?? ["Administrador", "Secretaria", "Tesouraria"];
    if (!allowed.includes("Professor"))
      throw new Error("Sem permissão para esta operação na escola.");
    return { schoolId: "school-a" };
  });
  m.insert.mockResolvedValue({ error: null });
});
describe("registo docente: autorização antes da emissão", () => {
  it("recusa emissão quando o contador partilhado atinge o limite", async () => {
    m.limit.mockResolvedValueOnce(false);
    await expect(registerIssuedDocument({ data })).rejects.toThrow(/Demasiados documentos/);
    expect(m.limit).toHaveBeenCalledWith(["document_issue:teacher"], {
      windowMs: 3600000,
      max: 300,
    });
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("regista apenas depois de confirmar escrita e turma atribuída na escola", async () => {
    await registerIssuedDocument({ data });
    expect(m.allowed).toHaveBeenCalledWith(expect.anything(), "school-a", "teacher-a");
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        school_id: "school-a",
        metadata: expect.objectContaining({
          class_group_ids: [CLASS],
          verification_scope: "issuance_registration",
        }),
      }),
    );
  });
  it("o professor passa no guarda de escrita da Pedagógica sem permissão extra", async () => {
    await registerIssuedDocument({ data });
    expect(m.write).toHaveBeenCalledWith("pedagogica", "teacher", ["Professor"]);
    expect(m.insert).toHaveBeenCalledTimes(1);
  });
  it("não regista sem turma nem com turma alheia", async () => {
    for (const ids of [[], [OTHER], [CLASS, OTHER]]) {
      await expect(
        registerIssuedDocument({ data: { ...data, classGroupIds: ids } }),
      ).rejects.toThrow(/turmas atribuídas/);
    }
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("falha fechada ao perder a permissão de escrita", async () => {
    m.write.mockRejectedValueOnce(new Error("Sem escrita"));
    await expect(registerIssuedDocument({ data })).rejects.toThrow("Sem escrita");
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("não converte falhas de consulta em autorização", async () => {
    m.allowed.mockRejectedValueOnce(new Error("base indisponível"));
    await expect(registerIssuedDocument({ data })).rejects.toThrow("base indisponível");
    expect(m.insert).not.toHaveBeenCalled();
  });
});
