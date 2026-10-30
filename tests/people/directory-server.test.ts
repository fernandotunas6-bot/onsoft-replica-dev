import { describe, expect, it, vi } from "vitest";
import { searchPeopleDirectoryPage } from "@/features/people/directory-server";
import { searchPeoplePageInputSchema } from "@/features/people/schemas";
import { memoryDb } from "../students/memory-db";

vi.mock("@/features/students/student-scope", () => ({
  loadStudentScope: async () => ({ all: true }),
}));

function fixture(error?: { code: string; message: string }) {
  const store = memoryDb({
    people: [
      { id: "p-a", school_id: "school-a", full_name: "Ana Teste", status: "active" },
      { id: "p-b", school_id: "school-b", full_name: "Beto Teste", status: "active" },
    ],
    students: [{ school_id: "school-a", person_id: "p-a" }],
    person_roles: [
      { school_id: "school-a", person_id: "p-a", role: "funcionario", active: true },
      { school_id: "school-b", person_id: "p-b", role: "diretor", active: true },
    ],
  });
  const db = {
    from(table: string) {
      if (!error || table !== "person_roles")
        return (store.db as unknown as { from: (table: string) => unknown }).from(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error }),
      };
      return chain;
    },
  };
  return (input: Record<string, unknown> = {}) =>
    searchPeopleDirectoryPage(
      db as never,
      { schoolId: "school-a", appRole: "Administrador" } as never,
      "user-a",
      searchPeoplePageInputSchema.parse(input),
    );
}

describe("directório de Pessoas: vínculos completos ou erro explícito", () => {
  it("preserva os papéis e conta apenas pessoas da escola autorizada", async () => {
    const result = await fixture()();
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: "p-a", roles: ["aluno", "funcionario"] });
  });
  it("não confunde permissão recusada com tabela de vínculos ausente", async () => {
    await expect(
      fixture({ code: "42501", message: "permission denied for table person_roles" })(),
    ).rejects.toThrow();
  });
  it("não mascara falhas PostgREST só porque a mensagem menciona person_roles", async () => {
    await expect(
      fixture({ code: "PGRST000", message: "person_roles: connection unavailable" })(),
    ).rejects.toThrow();
  });
  it("mantém leitura legada sem filtro institucional quando falta a tabela", async () => {
    const result = await fixture({
      code: "42P01",
      message: "relation person_roles does not exist",
    })();
    expect(result.total).toBe(1);
    expect(result.items[0]?.roles).toEqual(["aluno"]);
  });
  it("não apresenta zero resultados quando o filtro depende da tabela em falta", async () => {
    const search = fixture({ code: "42P01", message: "relation person_roles does not exist" });
    await expect(search({ role: "funcionario" })).rejects.toThrow();
    await expect(search({ query: "func" })).rejects.toThrow();
  });
});
