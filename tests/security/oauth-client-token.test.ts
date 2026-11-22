import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { isOAuthClientToken, oauthClientIdOf } from "@/integrations/supabase/oauth-client-token";

/**
 * Análise 22, P2-1: tokens emitidos a aplicações OAuth (agentes de IA) trazem `client_id`
 * e valiam o mesmo que a sessão da pessoa. Só o /mcp os aceita.
 */
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (payload: Record<string, unknown>) => `${b64({ alg: "ES256" })}.${b64(payload)}.sig`;
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("tokens de aplicações OAuth", () => {
  it("reconhece client_id e ignora sessões normais", () => {
    expect(oauthClientIdOf(jwt({ sub: "u", client_id: "abc" }))).toBe("abc");
    expect(isOAuthClientToken(jwt({ sub: "u", client_id: "abc" }))).toBe(true);
    for (const payload of [{ sub: "u" }, { sub: "u", client_id: "" }, { sub: "u", client_id: 7 }]) {
      expect(isOAuthClientToken(jwt(payload))).toBe(false);
    }
    expect(isOAuthClientToken("nao.e.jwt")).toBe(false);
    expect(isOAuthClientToken("")).toBe(false);
  });

  it("as APIs com Bearer (SaaS, app móvel, ADMIN) recusam o token antes do Supabase", async () => {
    const getUser = vi.fn();
    vi.doMock("@/integrations/supabase/sga-admin", () => ({
      loadSgaAdminClient: async () => ({ auth: { getUser } }),
      resolveSgaMembershipAdmin: vi.fn(),
    }));
    const { resolveBearerSession, resolvePlatformSessionFromRequest } =
      await import("@/features/saas/platform-guard");
    const token = jwt({ sub: "u", client_id: "abc", aal: "aal2" });
    await expect(resolveBearerSession(`Bearer ${token}`)).rejects.toThrow(/Unauthorized/);
    const request = new Request("https://portal-siga.com/api/saas/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(resolvePlatformSessionFromRequest(request)).resolves.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
    vi.doUnmock("@/integrations/supabase/sga-admin");
  });

  it("o /mcp não confia em X-Forwarded-Host/Proto e apresenta-se como SIGA Plus", () => {
    // As rotas são geradas pelo plugin a cada build (e o build recusa uma rota sem o
    // cabeçalho gerado): a opção vive no vite.config.ts, as rotas só a reflectem.
    expect(read("vite.config.ts")).toContain(
      "mcpPlugin({ trustForwardedHost: false, trustForwardedProto: false })",
    );
    for (const route of [
      "src/routes/mcp.ts",
      "src/routes/[.well-known]/oauth-protected-resource.ts",
    ]) {
      const source = read(route);
      expect(source, route).not.toMatch(/trustForwarded(Host|Proto): true/);
      expect(source, route).not.toContain("forwardedHostTrustedByPlatform");
    }
    expect(read("src/lib/mcp/index.ts")).toContain('title: "SIGA Plus"');
  });

  it("o consentimento mostra o endereço de regresso", () => {
    const consent = read("src/routes/[.]lovable.oauth.consent.tsx");
    expect(consent).toContain("hostOf(details?.redirect_uri)");
    expect(consent).toContain("Regressa a:");
  });
});
