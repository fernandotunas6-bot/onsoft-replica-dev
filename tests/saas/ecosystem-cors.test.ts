import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedEcosystemOrigin } from "@/lib/ecosystem-cors";
import { isPublicAppPath } from "@/lib/public-paths";

describe("ecosystem CORS origins", () => {
  it("allows the local WEB origin", () => {
    expect(isAllowedEcosystemOrigin("http://localhost:5174", ["web"])).toBe(true);
  });

  it("rejects an arbitrary origin", () => {
    expect(isAllowedEcosystemOrigin("https://evil.example", ["web"])).toBe(false);
  });

  it("rejects a missing origin", () => {
    expect(isAllowedEcosystemOrigin(null, ["web"])).toBe(false);
  });
});

describe("public ecosystem paths", () => {
  it("treats SaaS HTTP APIs as public", () => {
    expect(isPublicAppPath("/api/saas/signup")).toBe(true);
    expect(isPublicAppPath("/api/saas/plans")).toBe(true);
    expect(isPublicAppPath("/api/saas/me")).toBe(true);
    expect(isPublicAppPath("/api/saas/usage/sync")).toBe(true);
  });

  it("treats SaaS and create-school bridges as public", () => {
    expect(isPublicAppPath("/saas-admin")).toBe(true);
    expect(isPublicAppPath("/criar-escola")).toBe(true);
  });
});

describe("CORS segue PLATFORM_DOMAIN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("aceita as apps e as escolas do domínio configurado", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "escolas.ao");
    expect(isAllowedEcosystemOrigin("https://escolas.ao")).toBe(true);
    expect(isAllowedEcosystemOrigin("https://www.escolas.ao")).toBe(true);
    expect(isAllowedEcosystemOrigin("https://admin.escolas.ao")).toBe(true);
    expect(isAllowedEcosystemOrigin("https://liceu.escolas.ao")).toBe(true);
  });

  it("deixa de aceitar o domínio antigo quando o domínio muda", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "escolas.ao");
    expect(isAllowedEcosystemOrigin("https://admin.portal-siga.com")).toBe(false);
    expect(isAllowedEcosystemOrigin("https://liceu.portal-siga.com")).toBe(false);
    expect(isAllowedEcosystemOrigin("https://escolas.ao.evil.example")).toBe(false);
    // Os projectos Pages explícitos mantêm-se.
    expect(isAllowedEcosystemOrigin("https://siga-admin.pages.dev")).toBe(true);
  });
});
