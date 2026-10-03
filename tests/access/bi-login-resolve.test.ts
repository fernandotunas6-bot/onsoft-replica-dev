import { beforeEach, describe, expect, it, vi } from "vitest";

const { linhas } = vi.hoisted(() => ({
  linhas: {
    national_id: [] as Array<{ email: string | null; user_id: string | null }>,
    phone: [] as Array<{ email: string | null; user_id: string | null }>,
  },
}));

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (coluna: "national_id" | "phone") => ({
          limit: async () => ({ data: linhas[coluna], error: null }),
        }),
      }),
    }),
  }),
}));

import { resolveBiOrEmailToUserEmail } from "@/features/access/bi-login";

const BI = "004567891LA042";

describe("login por B.I.: que e-mail usar", () => {
  beforeEach(() => {
    linhas.national_id = [];
    linhas.phone = [];
  });

  it("um só e-mail em todas as fichas: usa-o", async () => {
    linhas.national_id = [
      { email: "Ana@escola.ao", user_id: null },
      { email: "ana@escola.ao", user_id: null },
    ];
    expect(await resolveBiOrEmailToUserEmail(BI)).toBe("ana@escola.ao");
  });

  it("e-mails diferentes sem ficha ligada: não escolhe ao acaso", async () => {
    linhas.national_id = [
      { email: "ana@escola.ao", user_id: null },
      { email: "outra@escola.ao", user_id: null },
    ];
    expect(await resolveBiOrEmailToUserEmail(BI)).not.toContain("@");
  });

  it("a ficha ligada a uma conta tem prioridade", async () => {
    linhas.national_id = [
      { email: "errado@outra.ao", user_id: null },
      { email: "ana@escola.ao", user_id: "u1" },
    ];
    expect(await resolveBiOrEmailToUserEmail(BI)).toBe("ana@escola.ao");
  });
});
