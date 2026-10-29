import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeMembership = { userId: string; schoolId: string; appRole: string };

const state = vi.hoisted(() => ({
  cookieSchool: null as string | null,
  memberships: [] as FakeMembership[],
  grants: {} as Record<string, string>,
  failGrantLookup: false,
  archivedSchool: null as string | null,
  schoolsQueried: [] as string[],
}));

vi.mock("@/integrations/supabase/sga", () => ({
  sgaClient: (client: unknown) => client,
  resolveSgaMembership: vi.fn(
    async (_client: unknown, userId: string, preferredSchoolId?: string | null) => {
      const memberships = state.memberships.filter((item) => item.userId === userId);
      const chosen =
        memberships.find((item) => item.schoolId === preferredSchoolId) ?? memberships[0];
      return chosen
        ? { schoolId: chosen.schoolId, appRole: chosen.appRole, userId }
        : null;
    },
  ),
}));
vi.mock("@/integrations/supabase/chunked-in-client", () => ({
  chunkedInClient: (client: unknown) => client,
}));
vi.mock("@/features/auth/active-school-cookie.server", () => ({
  readActiveSchoolCookie: () => state.cookieSchool,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      const filters: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => {
          if (table === "staff_module_grants") {
            if (state.failGrantLookup) {
              return { data: null, error: { code: "42501", message: "permission denied" } };
            }
            const key = `${filters["school_id"]}|${filters["user_id"]}|${filters["module_key"]}`;
            const level = state.grants[key];
            return { data: level ? { level } : null, error: null };
          }
          if (table === "schools") {
            const schoolId = filters["id"] ?? "";
            state.schoolsQueried.push(schoolId);
            return {
              data: {
                status: schoolId === state.archivedSchool ? "archived" : "active",
                tenant_id: null,
              },
              error: null,
            };
          }
          throw new Error(`Unexpected query: ${table}`);
        },
      };
      return query;
    },
  },
}));

import {
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";

const financeRoles = ["Administrador", "Secretaria", "Tesouraria"] as const;

beforeEach(() => {
  state.cookieSchool = null;
  state.failGrantLookup = false;
  state.archivedSchool = null;
  state.schoolsQueried = [];
  state.grants = {};
  state.memberships = [
    { userId: "conta-1", schoolId: "escola-A", appRole: "Administrador" },
    { userId: "conta-1", schoolId: "escola-B", appRole: "Professor" },
    { userId: "aluno-2", schoolId: "escola-B", appRole: "Aluno" },
  ];
});

describe("servidor: isolamento de escolas, leitura financeira e escrita", () => {
  it("usa a escola activa do cookie em vez dos poderes de outra escola", async () => {
    state.cookieSchool = "escola-B";
    await expect(
      requireSgaWriterForWrite("financeiro", "conta-1", [...financeRoles]),
    ).rejects.toThrow("Sem permissão para esta operação na escola.");
    expect(state.schoolsQueried).toEqual([]);

    state.cookieSchool = "escola-A";
    await expect(
      requireSgaWriterForWrite("financeiro", "conta-1", [...financeRoles]),
    ).resolves.toMatchObject({ schoolId: "escola-A" });
    expect(state.schoolsQueried).toEqual(["escola-A"]);
  });

  it("recusa uma escola pedida sem membership activa", async () => {
    await expect(
      requireSgaWriterFor("financeiro", "conta-1", [...financeRoles], "escola-C"),
    ).rejects.toThrow();
  });

  it("grant de leitura permite consultar mas bloqueia emitir propinas", async () => {
    state.grants["escola-B|conta-1|financeiro"] = "Leitura";
    await expect(
      requireSgaWriterFor("financeiro", "conta-1", [...financeRoles], "escola-B"),
    ).resolves.toMatchObject({ schoolId: "escola-B", appRole: "Professor" });
    await expect(
      requireSgaWriterForWrite("financeiro", "conta-1", [...financeRoles], "escola-B"),
    ).rejects.toThrow("Sem permissão para esta operação na escola.");
    expect(state.schoolsQueried).toEqual([]);
  });

  it("grant de escrita permite a função financeira só na sua escola activa", async () => {
    state.grants["escola-B|conta-1|financeiro"] = "Escrita";
    await expect(
      requireSgaWriterForWrite("financeiro", "conta-1", [...financeRoles], "escola-B"),
    ).resolves.toMatchObject({ schoolId: "escola-B" });
    expect(state.schoolsQueried).toEqual(["escola-B"]);
  });

  it("bloqueio Nenhum e erro ao consultar grants falham fechado", async () => {
    state.grants["escola-B|conta-1|financeiro"] = "Nenhum";
    await expect(
      requireSgaWriterFor("financeiro", "conta-1", [...financeRoles], "escola-B"),
    ).rejects.toThrow("Sem permissão para esta operação na escola.");

    state.failGrantLookup = true;
    await expect(
      requireSgaWriterFor("financeiro", "conta-1", [...financeRoles], "escola-B"),
    ).rejects.toThrow("Não foi possível confirmar as permissões desta conta.");
  });

  it("mesmo com grant Total, um aluno não recebe direitos administrativos", async () => {
    state.grants["escola-B|aluno-2|financeiro"] = "Total";
    await expect(
      requireSgaWriterForWrite("financeiro", "aluno-2", [...financeRoles], "escola-B"),
    ).rejects.toThrow("Sem permissão para esta operação na escola.");
  });

  it("escola arquivada pode ser lida mas não receber novas escritas", async () => {
    state.archivedSchool = "escola-A";
    await expect(
      requireSgaWriterFor("financeiro", "conta-1", [...financeRoles], "escola-A"),
    ).resolves.toMatchObject({ schoolId: "escola-A" });
    await expect(
      requireSgaWriterForWrite("financeiro", "conta-1", [...financeRoles], "escola-A"),
    ).rejects.toThrow("Esta escola está arquivada");
  });
});
