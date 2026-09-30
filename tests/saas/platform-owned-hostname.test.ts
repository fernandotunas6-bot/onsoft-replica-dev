import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlatformOwnedHostname } from "@/lib/saas/platform-domain";

/** Domínio próprio de uma escola nunca pode ser um endereço da plataforma. */
describe("isPlatformOwnedHostname", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("recusa a raiz e os subdomínios da plataforma", () => {
    // A regra antiga só apanhava `*.portal-siga.com`: a raiz passava.
    expect(isPlatformOwnedHostname("portal-siga.com")).toBe(true);
    expect(isPlatformOwnedHostname("admin.portal-siga.com")).toBe(true);
    expect(isPlatformOwnedHostname("Colegio.Portal-SIGA.com.")).toBe(true);
  });

  it("segue PLATFORM_DOMAIN e mantém o domínio legado", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "escolas.ao");
    expect(isPlatformOwnedHostname("escolas.ao")).toBe(true);
    expect(isPlatformOwnedHostname("admin.escolas.ao")).toBe(true);
    expect(isPlatformOwnedHostname("liceu.portal-siga.com")).toBe(true);
  });

  it("aceita domínios próprios das escolas", () => {
    expect(isPlatformOwnedHostname("portal.colegio.ao")).toBe(false);
    expect(isPlatformOwnedHostname("portal-siga.com.evil.example")).toBe(false);
    expect(isPlatformOwnedHostname("myportal-siga.com")).toBe(false);
  });
});
