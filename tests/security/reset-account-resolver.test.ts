import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAcceptedOtp, resolveResetAccount } from "@/features/auth/reset-account-resolver";

type Rows = Record<string, Array<Record<string, unknown>>>;

/** Base mínima: filtros eq/not/limit/order sobre linhas em memória. */
function fakeDb(rows: Rows) {
  return {
    from(table: string) {
      let result = [...(rows[table] ?? [])];
      const chain = {
        select: () => chain,
        eq: (col: string, value: unknown) => {
          result = result.filter((row) => row[col] === value);
          return chain;
        },
        not: (col: string) => {
          result = result.filter((row) => row[col] !== null && row[col] !== undefined);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
          resolve({ data: result, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

function fakeAdmin(users: Array<{ id: string; email?: string; phone?: string }>) {
  return {
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: users.find((u) => u.id === id) } }),
        listUsers: async ({ page }: { page: number }) => ({
          data: { users: page === 1 ? users : [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

const future = "2099-01-01T00:00:00Z";

describe("recuperação de senha: o contacto tem de ser da conta", () => {
  it("e-mail da ficha escolar que não é o da conta não recupera a conta", async () => {
    const db = fakeDb({ people: [{ email: "intruso@mail.ao", user_id: "vitima" }] });
    const admin = fakeAdmin([{ id: "vitima", email: "vitima@escola.ao" }]);
    expect(await resolveResetAccount(db, admin, "intruso@mail.ao")).toBeNull();
  });

  it("e-mail da própria conta recupera", async () => {
    const db = fakeDb({ people: [] });
    const admin = fakeAdmin([{ id: "u1", email: "pessoa@escola.ao" }]);
    expect(await resolveResetAccount(db, admin, "pessoa@escola.ao")).toBe("u1");
  });

  it("telefone gravado no perfil sem verificação não recupera a conta", async () => {
    const db = fakeDb({
      profiles: [{ id: "vitima", phone: "244923000000" }],
      verification_otps: [],
    });
    const admin = fakeAdmin([{ id: "vitima", email: "v@escola.ao" }]);
    expect(await resolveResetAccount(db, admin, "244923000000")).toBeNull();
  });

  it("telefone confirmado por código pela própria conta recupera", async () => {
    const db = fakeDb({
      profiles: [{ id: "u1", phone: "244923000000" }],
      verification_otps: [
        {
          user_id: "u1",
          purpose: "phone_change",
          target_identifier: "244923000000",
          attempts_left: 4,
          expires_at: future,
          consumed_at: "2026-09-26T10:00:00Z",
        },
      ],
    });
    const admin = fakeAdmin([{ id: "u1", email: "u1@escola.ao" }]);
    expect(await resolveResetAccount(db, admin, "244923000000")).toBe("u1");
  });

  it("código expirado ou esgotado não conta como verificação", () => {
    expect(
      isAcceptedOtp({
        attempts_left: 0,
        expires_at: future,
        consumed_at: "2026-09-26T10:00:00Z",
      }),
    ).toBe(false);
    expect(
      isAcceptedOtp({
        attempts_left: 3,
        expires_at: "2026-09-26T09:00:00Z",
        consumed_at: "2026-09-26T10:00:00Z",
      }),
    ).toBe(false);
  });
});
