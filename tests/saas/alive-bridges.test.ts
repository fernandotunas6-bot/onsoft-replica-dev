import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contrato: rotas mortas do kit devem estar mapeadas para destinos vivos.
 * Não importa os bundles Next/Vite — lê o mapa fonte.
 */
function readBridgeMap(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("alive-bridges (ecossistema)", () => {
  it("ADMIN mapeia demos para SaaS / SIGA / WEB / DOC", () => {
    const src = readBridgeMap("painel/admin/src/lib/alive-bridges.ts");
    expect(src).toContain('"/settings/notifications"');
    expect(src).toContain('"/mail"');
    expect(src).toContain('"/settings/connections"');
    expect(src).toContain("integracoes");
    expect(src).toContain('"/settings/user"');
    expect(src).toContain("/platform-admins");
    expect(src).toContain('"/landing"');
    expect(src).toContain("getWebUrl");
    expect(src).toContain('"/sign-up"');
    expect(src).toContain("getCreateSchoolUrl");
  });

  it("WEB mapeia demos para portal / SIGA / DOC", () => {
    const src = readBridgeMap("painel/web/src/lib/alive-bridges.ts");
    expect(src).toContain('"/dashboard"');
    expect(src).toContain('"/auth/sign-in"');
    expect(src).toContain("getSigaLoginUrl");
    expect(src).toContain('"/tasks"');
    expect(src).toContain("getCreateSchoolUrl");
    expect(src).toContain("getDocsUrl");
  });

  it("proxy ADMIN resolve pontes quando template está off", () => {
    const proxy = readBridgeMap("painel/admin/src/proxy.ts");
    expect(proxy).toContain("resolveAdminAliveBridge");
    expect(proxy).toContain("SHOW_TEMPLATE_SURFACES");
  });

  it("proxy ADMIN exige platform_admins em rotas SaaS (Fase 10)", () => {
    const proxy = readBridgeMap("painel/admin/src/proxy.ts");
    expect(proxy).toContain("assertPlatformAdmin");
    expect(proxy).toContain("/api/saas/me");
    expect(proxy).toContain("platformAdmin");
    expect(proxy).toContain("error");
    expect(proxy).toContain("platform");
  });

  it("WEB routes usam AliveBridgeRedirect", () => {
    const routes = readBridgeMap("painel/web/src/config/routes.tsx");
    expect(routes).toContain("AliveBridgeRedirect");
    expect(routes).toContain("SHOW_TEMPLATE_SURFACES");
  });
});
