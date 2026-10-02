import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O administrador da plataforma mexe em todas as escolas: as rotas /api/saas/* e as
 * server functions SaaS exigem sessão com MFA (`aal2`), não só palavra-passe.
 */
let isAdmin = true;
let userId = "user-1";

const db = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: isAdmin ? { user_id: userId } : null, error: null }),
      }),
    }),
  }),
  auth: {
    getUser: async () => ({ data: { user: { id: userId, email: "a@b.ao" } }, error: null }),
  },
};

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => db,
  resolveSgaMembershipAdmin: async () => null,
}));

const {
  PLATFORM_MFA_REQUIRED,
  requirePlatformAdmin,
  requirePlatformAdminFromRequest,
  resolvePlatformSessionFromRequest,
  tokenAal,
} = await import("@/features/saas/platform-guard");

function token(claims: Record<string, unknown>) {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(claims)}.assinatura`;
}

beforeEach(() => {
  isAdmin = true;
  userId = "user-1";
});

describe("MFA do administrador da plataforma", () => {
  it("lê o aal do token", () => {
    expect(tokenAal(token({ aal: "aal2" }))).toBe("aal2");
    expect(tokenAal(token({ aal: "aal1" }))).toBe("aal1");
    expect(tokenAal("lixo")).toBeNull();
  });

  it("administrador com aal2 passa", async () => {
    await expect(requirePlatformAdmin("user-1", "aal2")).resolves.toBeUndefined();
  });

  it("administrador só com palavra-passe (aal1) é recusado com a mensagem de MFA", async () => {
    await expect(requirePlatformAdmin("user-1", "aal1")).rejects.toThrow(PLATFORM_MFA_REQUIRED);
    await expect(requirePlatformAdmin("user-1", undefined)).rejects.toThrow(PLATFORM_MFA_REQUIRED);
  });

  it("quem não é administrador continua recusado, mesmo com aal2", async () => {
    isAdmin = false;
    await expect(requirePlatformAdmin("user-1", "aal2")).rejects.toThrow(
      "Sem permissão de administrador da plataforma.",
    );
  });

  it("as rotas /api/saas/* usam o aal do Bearer", async () => {
    const pedido = (aal: string) =>
      new Request("https://x/api/saas/tenants", {
        headers: { Authorization: `Bearer ${token({ sub: "user-1", aal })}` },
      });
    await expect(requirePlatformAdminFromRequest(pedido("aal2"))).resolves.toBe("user-1");
    await expect(requirePlatformAdminFromRequest(pedido("aal1"))).rejects.toThrow(
      PLATFORM_MFA_REQUIRED,
    );
  });

  it("a mensagem de MFA contém «Sem permissão» (as rotas respondem 401)", () => {
    expect(PLATFORM_MFA_REQUIRED).toContain("Sem permissão");
  });

  it("/api/saas/me diz ao ADMIN se a sessão tem MFA", async () => {
    const pedido = new Request("https://x/api/saas/me", {
      headers: { Authorization: `Bearer ${token({ sub: "user-1", aal: "aal1" })}` },
    });
    await expect(resolvePlatformSessionFromRequest(pedido)).resolves.toMatchObject({
      platformAdmin: true,
      mfa: false,
    });
  });
});
