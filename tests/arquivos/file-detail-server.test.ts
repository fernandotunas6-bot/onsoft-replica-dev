import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Página de um ficheiro (`getSchoolFileDetail`): as mesmas regras da lista de
 * Arquivos. Um ficheiro que a conta não veria na lista devolve null sem dizer
 * porquê, e o caminho no Storage nunca sai do servidor.
 */

const mocks = vi.hoisted(() => ({
  membership: { schoolId: "school-a", appRole: "Secretaria", allAppRoles: ["Secretaria"] },
  guard: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  filters: [] as Array<[string, string, unknown]>,
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
vi.mock("@/features/people/lookup", () => ({
  loadPersonNamesById: async () => new Map([["pessoa-ana", "Ana Paula Silva"]]),
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => mocks.membership,
  requireSgaWriterFor: async (...args: unknown[]) => {
    mocks.guard(...args);
    return mocks.membership;
  },
  requireSgaWriterForWrite: async () => mocks.membership,
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      const result = () => mocks.tables[table] ?? { data: [], error: null };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        in: (column: string, value: unknown) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        is: (column: string, value: unknown) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        order: () => query,
        limit: () => query,
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

import { getSchoolFileDetail } from "@/features/arquivos/server";

type Handler = (args: {
  data: Record<string, unknown>;
  context: { userId: string; supabase: unknown };
}) => Promise<Awaited<ReturnType<typeof getSchoolFileDetail>>>;
const run = (id: string, userId = "user-a") =>
  (getSchoolFileDetail as unknown as Handler)({ data: { id }, context: { userId, supabase: {} } });

const FICHEIRO = "44444444-4444-4444-8444-444444444444";
const TURMA = "11111111-1111-4111-8111-111111111111";
const ALUNO = "22222222-2222-4222-8222-222222222222";

const fileRow = (over: Record<string, unknown> = {}) => ({
  id: FICHEIRO,
  school_id: "school-a",
  owner_user_id: "dono",
  name: "certidao-nascimento.pdf",
  mime: "application/pdf",
  size_bytes: 120_000,
  area: "secretaria",
  visibility: "school",
  storage_backend: "sga",
  storage_path: "school-a/secretaria/certidao.pdf",
  class_group_id: TURMA,
  parent_id: null,
  is_folder: false,
  is_system: false,
  title: "Certidão de nascimento",
  description: "Cópia certificada entregue na matrícula",
  category: "bilhete",
  document_date: "2026-09-01",
  reference_code: "DOC-0042",
  related_user_id: null,
  related_person_id: "pessoa-ana",
  created_at: "2026-09-02T10:00:00Z",
  updated_at: null,
  updated_by: null,
  last_action: null,
  last_action_at: null,
  last_action_by: null,
  ...over,
});

const setRole = (appRole: string) => {
  mocks.membership = { schoolId: "school-a", appRole, allAppRoles: [appRole] };
};

describe("getSchoolFileDetail", () => {
  beforeEach(() => {
    setRole("Secretaria");
    mocks.guard.mockClear();
    mocks.filters = [];
    mocks.tables = {
      siga_files: { data: fileRow(), error: null },
      profiles: { data: [{ id: "dono", full_name: "Rosa Mateus", avatar_url: null }], error: null },
      class_groups: { data: { id: TURMA, name: "10ª A" }, error: null },
      students: { data: [{ id: ALUNO }], error: null },
    };
  });

  it("lê o ficheiro da escola activa, com a turma e o aluno, sem o caminho no Storage", async () => {
    const detail = await run(FICHEIRO);
    expect(mocks.guard).toHaveBeenCalledWith("arquivos", {}, "user-a", [
      "Administrador",
      "Secretaria",
      "Tesouraria",
      "Professor",
    ]);
    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ["siga_files", "id", FICHEIRO],
        ["siga_files", "school_id", "school-a"],
        ["siga_files", "deleted_at", null],
        ["class_groups", "school_id", "school-a"],
        ["students", "school_id", "school-a"],
        ["students", "person_id", "pessoa-ana"],
      ]),
    );
    expect(detail).toMatchObject({
      contentOpen: true,
      myAccess: "edit",
      classGroup: { id: TURMA, name: "10ª A" },
      student: { id: ALUNO, name: "Ana Paula Silva" },
      file: { ownerName: "Rosa Mateus", storagePath: "", description: expect.any(String) },
    });
  });

  it("um ficheiro que a escola activa não tem devolve null", async () => {
    mocks.tables.siga_files = { data: null, error: null };
    expect(await run(FICHEIRO)).toBeNull();
  });

  it("a área da Secretaria fica fechada ao professor, como na lista", async () => {
    setRole("Professor");
    expect(await run(FICHEIRO)).toBeNull();
    // Nem chega a procurar a turma ou o aluno do ficheiro.
    expect(mocks.filters.some(([table]) => table === "students")).toBe(false);
  });

  it("um ficheiro privado de outra pessoa não se abre; o do próprio sim", async () => {
    setRole("Professor");
    mocks.tables.siga_files = {
      data: fileRow({ area: "escola", visibility: "private" }),
      error: null,
    };
    expect(await run(FICHEIRO)).toBeNull();
    expect(await run(FICHEIRO, "dono")).toMatchObject({ myAccess: "owner" });
  });

  it("pastas e ficheiros só locais não têm página", async () => {
    mocks.tables.siga_files = { data: fileRow({ is_folder: true }), error: null };
    expect(await run(FICHEIRO)).toBeNull();
    mocks.tables.siga_files = { data: fileRow({ storage_backend: "local" }), error: null };
    expect(await run(FICHEIRO)).toBeNull();
  });

  it("um ficheiro do sistema aparece ao professor sem o conteúdo nem a descrição", async () => {
    setRole("Professor");
    mocks.tables.siga_files = {
      data: fileRow({ area: "escola", is_system: true, related_person_id: null }),
      error: null,
    };
    const detail = await run(FICHEIRO);
    expect(detail).toMatchObject({ contentOpen: false, student: null });
    expect(detail?.file.description).toBeNull();
    expect(detail?.file.storagePath).toBe("");
  });
});
