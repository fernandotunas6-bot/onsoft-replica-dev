import { describe, it, expect, vi } from "vitest";

const state = vi.hoisted(() => ({
  people: [] as string[],
  students: [] as string[],
  history: [] as unknown[],
  previousYearStatus: "active",
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
  requireSgaWriterForWrite: async () => ({ schoolId: "AUDIT-A", appRole: "Administrador" }),
  requireSgaWriterFor: vi.fn(),
  resolveSgaMembershipAdmin: vi.fn(),
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      if (table === "academic_years") {
        let payload: { status?: string } | null = null;
        const chain = {
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          maybeSingle: async () => ({ data: { id: "AUDIT-Y2", name: "AUDIT-2027" }, error: null }),
          update: (value: { status: string }) => {
            payload = value;
            return chain;
          },
          then: (resolve: (value: unknown) => unknown) => {
            if (payload?.status === "closed") {
              state.previousYearStatus = "closed";
              return Promise.resolve(resolve({ error: null }));
            }
            return Promise.resolve(
              resolve({ error: { code: "P0001", message: "AUDIT injected activation failure" } }),
            );
          },
        };
        return chain;
      }
      if (table !== "people") throw new Error("Unexpected table: " + table);
      return {
        insert: () => ({
          select: () => ({
            single: async () => {
              const id = "AUDIT-P-" + (state.people.length + 1);
              state.people.push(id);
              return { data: { id }, error: null };
            },
          }),
        }),
      };
    },
  }),
}));
vi.mock("@/integrations/supabase/sga", () => ({
  sgaClient: () => ({
    rpc: async (name: string) => {
      if (name === "register_student") {
        const id = "AUDIT-S-" + (state.students.length + 1);
        state.students.push(id);
        return { data: { studentId: id, studentNumber: id, status: "applicant" }, error: null };
      }
      if (name === "enroll_student")
        return { data: null, error: { code: "P0001", message: "Turma sem vagas" } };
      throw new Error("Unexpected RPC: " + name);
    },
  }),
}));
vi.mock("@/features/saas/tenant-limits-server", () => ({
  assertCanAddStudentForSchool: async () => {},
}));
vi.mock("@/features/saas/usage-sync", () => ({ queueTenantUsageSync: vi.fn() }));
vi.mock("@/features/students/status-history", () => ({
  recordStudentStatusHistory: async (value: unknown) => {
    state.history.push(value);
  },
  recordStudentStatusHistoryBatch: vi.fn(),
}));

describe("Auditoria: recuperação da matrícula manual com falha da turma", () => {
  it("reproduz dois alunos persistidos quando o formulário é reenviado após falha de lotação", async () => {
    const { enrollNewStudent } = await import("@/features/students/server");
    const handler = enrollNewStudent as unknown as (input: unknown) => Promise<unknown>;
    const input = {
      data: {
        person: { full_name: "AUDIT-20261007 Aluno sintético" },
        classGroupId: "AUDIT-T",
        academicYearId: "AUDIT-Y",
      },
      context: { userId: "AUDIT-U", claims: { aal: "aal2" }, supabase: {} },
    };
    await expect(handler(input)).rejects.toThrow(/matrícula na turma/);
    expect(state.people).toHaveLength(1);
    expect(state.students).toHaveLength(1);
    await expect(handler(input)).rejects.toThrow(/matrícula na turma/);
    expect(state.people).toHaveLength(2);
    expect(state.students).toHaveLength(2);
    expect(state.history).toHaveLength(0);
  });
});

describe("Auditoria: activar outro ano lectivo", () => {
  it("reproduz perda do ano activo quando a segunda escrita falha", async () => {
    const { setActiveAcademicYear } = await import("@/features/calendar/server");
    const handler = setActiveAcademicYear as unknown as (input: unknown) => Promise<unknown>;
    await expect(
      handler({ data: { yearId: "AUDIT-Y2" }, context: { userId: "AUDIT-U", supabase: {} } }),
    ).rejects.toThrow(/activar o ano lectivo/);
    expect(state.previousYearStatus).toBe("closed");
  });
});

describe("Auditoria: cálculo independente e ficheiros sintéticos", () => {
  it("confere 1681 médias trimestrais contra fórmula independente", async () => {
    const { calculateTrimesterAverage } = await import("@/lib/angola-academic");
    for (let a = 0; a <= 40; a++)
      for (let b = 0; b <= 40; b++) {
        const mac = a / 2,
          npt = b / 2,
          expected = Math.floor((mac + npt) * 5 + 0.5) / 10;
        expect(calculateTrimesterAverage(mac, npt)).toBe(expected);
      }
  });
  it("analisa 200 alunos CSV com BOM, acentos, datas e telefone vazio sem escrever dados", async () => {
    const { parseImportFile } = await import("@/features/import/engine/parse");
    const lines = [
      "Nome;Nascimento;Telefone",
      ...Array.from({ length: 200 }, (_, i) => `AUDIT-20261007 João ${i};2010-01-02;`),
    ];
    const result = await parseImportFile(Buffer.from("\uFEFF" + lines.join("\n")), "AUDIT-200.csv");
    expect(result.sheets[0].rows).toHaveLength(200);
    expect(result.sheets[0].rows[199]["Nome"]).toBe("AUDIT-20261007 João 199");
    expect(result.sheets[0].rows[0]["Nascimento"]).toBe("2010-01-02");
  });
  it("reproduz truncagem silenciosa de CSV com 25001 linhas", async () => {
    const { parseImportFile } = await import("@/features/import/engine/parse");
    const csv = ["Nome", ...Array.from({ length: 25001 }, (_, i) => `AUDIT-20261007 ${i}`)].join(
      "\n",
    );
    const result = await parseImportFile(Buffer.from(csv), "AUDIT-25001.csv");
    expect(result.sheets[0].rows).toHaveLength(25000);
    expect(Object.keys(result.sheets[0]).sort()).toEqual(["headers", "name", "rows"]);
  });
});
