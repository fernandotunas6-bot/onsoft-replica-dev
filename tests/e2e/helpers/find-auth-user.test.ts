import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { findE2EAuthUserByEmail, type ListAuthUsers } from "./find-auth-user";

const target = "e2e+mat-test@siga-plus.test";
const createUser = (email: string): User => ({ id: email, email }) as User;
const pageOf = (count: number) =>
  Array.from({ length: count }, (_, index) => createUser(`other-${index}@siga-plus.test`));

describe("E2E Auth — pesquisa paginada e restrita a contas sintéticas", () => {
  it("encontra uma conta além da primeira página de 200 utilizadores", async () => {
    const firstPage = pageOf(200);
    const match = createUser(target.toUpperCase());
    const listUsers = vi.fn(async ({ page }: { page: number }) => ({
      data: { users: page === 1 ? firstPage : [match] },
      error: null,
    }));

    const user = await findE2EAuthUserByEmail(listUsers as unknown as ListAuthUsers, target);
    expect(user?.id).toBe(match.id);
    expect(listUsers).toHaveBeenCalledTimes(2);
    expect(listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 200 });
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 200 });
  });

  it("devolve null apenas após uma página final incompleta", async () => {
    const listUsers = vi.fn(async () => ({ data: { users: pageOf(3) }, error: null }));
    await expect(
      findE2EAuthUserByEmail(listUsers as unknown as ListAuthUsers, target),
    ).resolves.toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("recusa endereços reais ou com domínio de ensaio enganador", async () => {
    const listUsers = vi.fn();
    for (const email of [
      "admin@escola.ao",
      "admin@siga-plus.test.evil.invalid",
      "admin@example.com",
      "  ",
    ]) {
      await expect(
        findE2EAuthUserByEmail(listUsers as unknown as ListAuthUsers, email),
      ).rejects.toThrow(/siga-plus\.test/);
    }
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("não confunde falha de Auth com utilizador ausente nem revela mensagens remotas", async () => {
    const listUsers = vi.fn(async () => ({
      data: null,
      error: { message: "Token de serviço não deve ser mostrado" },
    }));
    await expect(
      findE2EAuthUserByEmail(listUsers as unknown as ListAuthUsers, target),
    ).rejects.toThrow("Falha ao consultar utilizadores de ensaio.");
  });

  it("falha fechado se todas as páginas estiverem cheias", async () => {
    const users = pageOf(200);
    const listUsers = vi.fn(async () => ({ data: { users }, error: null }));
    await expect(
      findE2EAuthUserByEmail(listUsers as unknown as ListAuthUsers, target),
    ).rejects.toThrow(/Limite de paginação/);
    expect(listUsers).toHaveBeenCalledTimes(100);
  });
});
