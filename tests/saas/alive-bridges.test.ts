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

  it("proxy e AliveBridgeGate do ADMIN resolvem sempre as pontes (as páginas do modelo saíram)", () => {
    const proxy = readBridgeMap("painel/admin/src/proxy.ts");
    expect(proxy).toContain("resolveAdminAliveBridge");
    expect(proxy).not.toContain("SHOW_TEMPLATE_SURFACES");
    const gate = readBridgeMap("painel/admin/src/components/alive-bridge-gate.tsx");
    expect(gate).toContain("const bridge = resolveAdminAliveBridge(path)");
    expect(gate).not.toContain("SHOW_TEMPLATE_SURFACES");
  });

  it("ADMIN: cada endereço herdado do modelo tem página vazia e a ponte no layout", () => {
    for (const route of [
      "(auth)/sign-in-2",
      "(auth)/sign-in-3",
      "(auth)/sign-up-2",
      "(auth)/sign-up-3",
      "(auth)/forgot-password-2",
      "(auth)/forgot-password-3",
      "(dashboard)/settings/user",
      "(dashboard)/settings/account",
      "(dashboard)/settings/appearance",
      "(dashboard)/settings/notifications",
      "(dashboard)/settings/connections",
      "landing",
    ]) {
      const dir = `painel/admin/src/app/${route}`;
      expect(readBridgeMap(`${dir}/layout.tsx`), route).toContain("<AliveBridgeGate");
      expect(readBridgeMap(`${dir}/page.tsx`), route).toMatch(/return null;?\n\}/);
    }
  });

  it("proxy ADMIN exige platform_admins em rotas SaaS (Fase 10)", () => {
    const proxy = readBridgeMap("painel/admin/src/proxy.ts");
    expect(proxy).toContain("assertPlatformAdmin");
    expect(proxy).toContain("/api/saas/me");
    expect(proxy).toContain("platformAdmin");
    expect(proxy).toContain("error");
    expect(proxy).toContain("platform");
  });

  it("WEB routes usam AliveBridgeRedirect, sempre (as páginas do modelo saíram)", () => {
    const routes = readBridgeMap("painel/web/src/config/routes.tsx");
    expect(routes).toContain("AliveBridgeRedirect");
    expect(routes).toContain("BRIDGED_PATHS.map");
    expect(routes).not.toContain("SHOW_TEMPLATE_SURFACES");
    expect(routes).not.toMatch(/import\('@\/app\/(auth|settings)\//);
  });

  it("WEB: recuperar a senha leva ao SIGA (o formulário do modelo não enviava nada)", () => {
    const routes = readBridgeMap("painel/web/src/config/routes.tsx");
    expect(routes).toMatch(/BRIDGED_PATHS = \[[^\]]*"\/auth\/forgot-password"/s);
    const bridges = readBridgeMap("painel/web/src/lib/alive-bridges.ts");
    for (const path of [
      "/auth/forgot-password",
      "/auth/forgot-password-2",
      "/auth/forgot-password-3",
    ]) {
      const entry = bridges.slice(bridges.indexOf(`"${path}": {`)).split("},")[0];
      expect(entry, path).toContain("getSigaLoginUrl()");
      expect(entry, path).toContain("external: true");
    }
  });

  it("WEB: /mail usa o formulário de contacto real (grava para a equipa ou prepara o e-mail)", () => {
    const page = readBridgeMap("painel/web/src/app/mail/page.tsx");
    expect(page).toContain("<ContactSection />");
    expect(page).not.toContain("setSent(");
  });
});
