import { beforeEach, describe, expect, it, vi } from "vitest";

const { linhas, authEmails } = vi.hoisted(() => ({
  linhas: {
    national_id: [] as Array<{ email: string | null; user_id: string | null }>,
    phone: [] as Array<{ email: string | null; user_id: string | null }>,
  },
  authEmails: new Map<string, string>(),
}));

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (coluna: "national_id" | "phone") => ({
          is: () => ({
            limit: async () => ({ data: linhas[coluna], error: null }),
          }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: authEmails.has(id) ? { email: authEmails.get(id) } : null,
          },
          error: null,
        }),
      },
    },
  }),
}));

import { resolveBiOrEmailToUserEmail } from "@/features/access/bi-login";

const BI = "004567891LA042";

describe("login por B.I.: conta Auth comprovadamente vinculada", () => {
  beforeEach(() => {
    linhas.national_id = [];
    linhas.phone = [];
    authEmails.clear();
  });

  it("não autentica com e-mail de ficha editável sem vínculo à conta", async () => {
    linhas.national_id = [
      { email: "Ana@escola.ao", user_id: null },
      { email: "ana@escola.ao", user_id: null },
    ];
    expect(await resolveBiOrEmailToUserEmail(BI)).toBe(BI);
  });

  it("e-mails diferentes sem ficha ligada: não escolhe ao acaso", async () => {
    linhas.national_id = [
      { email: "ana@escola.ao", user_id: null },
      { email: "outra@escola.ao", user_id: null },
    ];
    expect(await resolveBiOrEmailToUserEmail(BI)).toBe(BI);
  });

  it("usa e-mail verificado da conta Auth, nunca o e-mail escrito na ficha", async () => {
    linhas.national_id = [
      { email: "errado@outra.ao", user_id: null },
      { email: "outra-conta@invalida.ao", user_id: "u1" },
    ];
    authEmails.set("u1", "CONTA@auth.ao");
    expect(await resolveBiOrEmailToUserEmail(BI)).toBe("conta@auth.ao");
  });

  it("duas escolas com fichas do mesmo aluno e mesmo user_id não causam ambiguidade", async () => {
    linhas.national_id = [
      { email: "outra-escola@erro.ao", user_id: "u1" },
      { email: "secretaria@erro.ao", user_id: "u1" },
    ];
    authEmails.set("u1", "aluno@auth.ao");
    expect(await resolveBiOrEmailToUserEmail(BI)).toBe("aluno@auth.ao");
  });

  it("rejeita um BI ligado a duas contas Auth distintas", async () => {
    linhas.national_id = [
      { email: "primeira@escola.ao", user_id: "u1" },
      { email: "segunda@escola.ao", user_id: "u2" },
    ];
    authEmails.set("u1", "primeira@auth.ao");
    authEmails.set("u2", "segunda@auth.ao");
    expect(await resolveBiOrEmailToUserEmail(BI)).toBe(BI);
  });

  it("não autentica ficheiro ligado a utilizador Auth inexistente", async () => {
    linhas.national_id = [{ email: "antigo@escola.ao", user_id: "inexistente" }];
    expect(await resolveBiOrEmailToUserEmail(BI)).toBe(BI);
  });

  it("preserva login por telefone quando existe vínculo Auth válido", async () => {
    linhas.phone = [{ email: "telefone@escola.ao", user_id: "u1" }];
    authEmails.set("u1", "telefone@auth.ao");
    expect(await resolveBiOrEmailToUserEmail("923123456")).toBe("telefone@auth.ao");
  });
});
