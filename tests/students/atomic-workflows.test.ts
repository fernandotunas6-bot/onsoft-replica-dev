import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  completed: false,
  rpc: vi.fn(),
  capacity: vi.fn(),
  writer: vi.fn(),
  usage: vi.fn(),
  adminWrites: vi.fn(),
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
  requireSgaWriterForWrite: state.writer,
  requireSgaWriterFor: vi.fn(),
  resolveSgaMembershipAdmin: vi.fn(),
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      if (table !== "audit_logs") throw new Error("Unexpected table: " + table);
      const query = {
        select: () => query,
        eq: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: state.completed ? { id: 1 } : null, error: null }),
        insert: state.adminWrites,
        update: state.adminWrites,
        delete: state.adminWrites,
      };
      return query;
    },
  }),
}));
vi.mock("@/features/saas/tenant-limits-server", () => ({
  assertCanAddStudentForSchool: state.capacity,
}));
vi.mock("@/features/saas/usage-sync", () => ({ queueTenantUsageSync: state.usage }));

const school = "00000000-0000-0000-0000-000000000002";
const result = {
  id: "00000000-0000-0000-0000-000000000010",
  person_id: "00000000-0000-0000-0000-000000000011",
  student_number: "EST-000001",
  status: "active",
  enrollment_number: "MAT-000001",
};
const input = {
  requestId: "00000000-0000-0000-0000-000000000012",
  person: { full_name: "AUDIT Aluno", sex: "outro" },
  guardians: [],
};
const context = {
  userId: "00000000-0000-0000-0000-000000000001",
  claims: { aal: "aal2" },
  supabase: { rpc: state.rpc },
};
async function enroll(data = input, session = context) {
  const { enrollNewStudent } = await import("@/features/students/server");
  return (enrollNewStudent as unknown as (arg: unknown) => Promise<unknown>)({
    data,
    context: session,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.completed = false;
  state.writer.mockResolvedValue({ schoolId: school, appRole: "Administrador" });
  state.capacity.mockResolvedValue(undefined);
  state.rpc.mockResolvedValue({ data: result, error: null });
});
describe("matrícula interna atómica", () => {
  it("uma chamada guarda o conjunto; a escola vem da sessão e outro usa o estado SGA other", async () => {
    expect(await enroll()).toEqual(result);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc.mock.calls[0][0]).toBe("siga_enroll_new_student_atomic");
    expect(state.rpc.mock.calls[0][1]).toMatchObject({
      p_school_id: school,
      p_request_id: input.requestId,
      p_person: { sex: "other" },
    });
    expect(state.adminWrites).not.toHaveBeenCalled();
    expect(state.usage).toHaveBeenCalledWith(school);
  });
  it("AAL1 e falta de permissão impedem qualquer RPC", async () => {
    await expect(enroll(input, { ...context, claims: { aal: "aal1" } })).rejects.toThrow(/2FA/);
    expect(state.rpc).not.toHaveBeenCalled();
    state.writer.mockRejectedValueOnce(new Error("Sem permissão"));
    await expect(enroll()).rejects.toThrow(/Sem permissão/);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("RPC ausente falha fechado sem usar as escritas parciais antigas", async () => {
    state.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "missing function" },
    });
    await expect(enroll()).rejects.toThrow(/temporariamente indisponível/);
    expect(state.adminWrites).not.toHaveBeenCalled();
    expect(state.usage).not.toHaveBeenCalled();
  });
  it("reenvio concluído não é recusado pelo limite de alunos", async () => {
    state.completed = true;
    state.capacity.mockRejectedValueOnce(new Error("Plano cheio"));
    expect(await enroll()).toEqual(result);
    expect(state.capacity).not.toHaveBeenCalled();
  });
  it("nova matrícula respeita o limite antes da escrita", async () => {
    state.capacity.mockRejectedValueOnce(new Error("Plano cheio"));
    await expect(enroll()).rejects.toThrow(/Plano cheio/);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("ano lectivo no handler real", () => {
  it("criação e selecção enviam o mesmo RPC com a escola autorizada", async () => {
    const { createAcademicYear, setActiveAcademicYear } =
      await import("@/features/calendar/server");
    state.rpc.mockResolvedValue({
      data: { id: result.id, name: "AUDIT-2026", created: false },
      error: null,
    });
    await (setActiveAcademicYear as unknown as (arg: unknown) => Promise<unknown>)({
      data: { yearId: result.id },
      context,
    });
    expect(state.rpc.mock.calls[0]).toEqual([
      "siga_save_active_academic_year",
      {
        p_school_id: school,
        p_year_id: result.id,
        p_name: null,
        p_starts_on: null,
        p_ends_on: null,
      },
    ]);
    await (createAcademicYear as unknown as (arg: unknown) => Promise<unknown>)({
      data: { name: "AUDIT-2026", startsOn: "2026-01-01", endsOn: "2026-12-31" },
      context,
    });
    expect(state.rpc.mock.calls[1][1]).toMatchObject({
      p_school_id: school,
      p_year_id: null,
      p_name: "AUDIT-2026",
    });
    expect(state.adminWrites).not.toHaveBeenCalled();
  });
  it("AAL1 recusa a activação antes do pedido", async () => {
    const { setActiveAcademicYear } = await import("@/features/calendar/server");
    await expect(
      (setActiveAcademicYear as unknown as (arg: unknown) => Promise<unknown>)({
        data: { yearId: result.id },
        context: { ...context, claims: { aal: "aal1" } },
      }),
    ).rejects.toThrow(/2FA/);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
