import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Página do comunicado (`getSchoolAnnouncement`): as regras da lista. O pessoal lê
 * qualquer comunicado da escola que não esteja arquivado; o aluno e o encarregado
 * só os enviados ao seu público. O que a conta não pode ler é `null`.
 */

const mocks = vi.hoisted(() => ({
  membership: {
    schoolId: "school-a",
    appRole: "Secretaria",
    allAppRoles: ["Secretaria"] as string[],
  } as { schoolId: string; appRole: string; allAppRoles: string[] } | null,
  row: null as Record<string, unknown> | null,
  error: null as unknown,
  filters: [] as Array<[string, unknown]>,
  updates: 0,
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
vi.mock("@/features/students/student-scope", () => ({
  loadStudentScope: async () => ({ all: false, studentIds: [] }),
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => mocks.membership,
  requireSgaWriterForWrite: async () => mocks.membership,
  loadSgaAdminClient: async () => ({
    from: () => {
      const query = {
        select: () => query,
        update: () => {
          mocks.updates += 1;
          return query;
        },
        eq: (column: string, value: unknown) => {
          mocks.filters.push([column, value]);
          return query;
        },
        is: (column: string, value: unknown) => {
          mocks.filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => ({ data: mocks.row, error: mocks.error }),
      };
      return query;
    },
  }),
}));

import { getSchoolAnnouncement } from "@/features/communications/server";

type Handler = (args: {
  data: { id: string };
  context: { userId: string; supabase: unknown; claims: Record<string, unknown> };
}) => Promise<unknown>;
const read = (id = "7b0f3a52-8d1c-4f6e-9a2b-3c4d5e6f7a8b") =>
  (getSchoolAnnouncement as unknown as Handler)({
    data: { id },
    context: { userId: "user-1", supabase: {}, claims: {} },
  });

const sent = {
  id: "7b0f3a52-8d1c-4f6e-9a2b-3c4d5e6f7a8b",
  title: "Reunião de pais",
  body: "Sexta-feira às 17h.\nNo salão.",
  audience: "all_guardians",
  channel: "portal",
  status: "sent",
  scheduled_for: null,
  published_at: "2026-10-20T09:00:00Z",
  created_at: "2026-10-19T10:00:00Z",
  updated_at: null,
};

function as(role: string) {
  mocks.membership = { schoolId: "school-a", appRole: role, allAppRoles: [role] };
}

beforeEach(() => {
  as("Secretaria");
  mocks.row = { ...sent };
  mocks.error = null;
  mocks.filters = [];
  mocks.updates = 0;
});

describe("getSchoolAnnouncement", () => {
  it("lê o comunicado na escola activa, sem os arquivados", async () => {
    const result = await read();
    expect(result).toMatchObject({ id: sent.id, title: "Reunião de pais", schoolId: "school-a" });
    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ["school_id", "school-a"],
        ["id", sent.id],
        ["deleted_at", null],
      ]),
    );
  });

  it("não publica agendados: ler um comunicado não muda nada", async () => {
    mocks.row = { ...sent, status: "scheduled", scheduled_for: "2026-10-01" };
    await read();
    expect(mocks.updates).toBe(0);
  });

  it("o pessoal lê rascunhos e os do corpo docente", async () => {
    mocks.row = { ...sent, status: "draft", audience: "teaching_staff" };
    expect(await read()).toMatchObject({ status: "draft" });
    as("Professor");
    expect(await read()).toMatchObject({ audience: "teaching_staff" });
  });

  it("o aluno lê os enviados ao seu público", async () => {
    as("Aluno");
    expect(await read()).toMatchObject({ id: sent.id });
    mocks.row = { ...sent, audience: "students_finalists" };
    expect(await read()).toMatchObject({ audience: "students_finalists" });
  });

  it("o aluno não lê rascunhos, agendados nem os de outro público", async () => {
    as("Aluno");
    mocks.row = { ...sent, status: "draft" };
    expect(await read()).toBeNull();
    mocks.row = { ...sent, status: "scheduled" };
    expect(await read()).toBeNull();
    mocks.row = { ...sent, audience: "teaching_staff" };
    expect(await read()).toBeNull();
  });

  it("o encarregado sem dívida não lê o aviso de cobrança", async () => {
    as("Encarregado");
    expect(await read()).toMatchObject({ id: sent.id });
    mocks.row = { ...sent, audience: "guardians_with_debt" };
    expect(await read()).toBeNull();
  });

  it("um comunicado que não existe nesta escola é null", async () => {
    mocks.row = null;
    expect(await read()).toBeNull();
  });

  it("sem membership, recusa", async () => {
    mocks.membership = null;
    await expect(read()).rejects.toThrow(/membership/);
  });
});
