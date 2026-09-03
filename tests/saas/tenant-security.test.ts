import { describe, expect, it } from "vitest";
import { resolveTenantLookup } from "@/lib/saas/tenant-resolver";
import { isAllowedEcosystemOrigin } from "@/lib/ecosystem-cors";

describe("tenant host security", () => {
  it("resolves a legitimate school subdomain to its slug", () => {
    expect(resolveTenantLookup("colegio-esperanca.portal-siga.com")).toEqual({
      mode: "slug",
      slug: "colegio-esperanca",
    });
  });

  it("normalizes a trailing DNS dot before resolving the school", () => {
    expect(resolveTenantLookup("colegio-esperanca.portal-siga.com.")).toEqual({
      mode: "slug",
      slug: "colegio-esperanca",
    });
  });

  it("does not map the platform root domain to a demo tenant", () => {
    expect(resolveTenantLookup("portal-siga.com")).toEqual({
      mode: "hostname",
      hostname: "portal-siga.com",
    });
  });

  it("fails closed when no hostname is available", () => {
    expect(resolveTenantLookup("")).toEqual({
      mode: "hostname",
      hostname: "",
    });
  });

  it("does not resolve reserved infrastructure subdomains as school tenants", () => {
    expect(resolveTenantLookup("admin.portal-siga.com")).toEqual({
      mode: "hostname",
      hostname: "admin.portal-siga.com",
    });
    expect(resolveTenantLookup("docs.portal-siga.com")).toEqual({
      mode: "hostname",
      hostname: "docs.portal-siga.com",
    });
  });

  it("does not resolve nested platform subdomains as a school slug", () => {
    expect(resolveTenantLookup("foo.bar.portal-siga.com")).toEqual({
      mode: "hostname",
      hostname: "foo.bar.portal-siga.com",
    });
  });

  it("does not treat arbitrary Cloudflare preview hosts as local development", () => {
    expect(resolveTenantLookup("attacker.pages.dev")).toEqual({
      mode: "hostname",
      hostname: "attacker.pages.dev",
    });
    expect(resolveTenantLookup("attacker.workers.dev")).toEqual({
      mode: "hostname",
      hostname: "attacker.workers.dev",
    });
  });
});

describe("ecosystem CORS security", () => {
  it("allows the explicitly configured SIGA Cloudflare projects", () => {
    expect(isAllowedEcosystemOrigin("https://siga-web.pages.dev")).toBe(true);
    expect(isAllowedEcosystemOrigin("https://siga-admin.pages.dev")).toBe(true);
  });

  it("rejects arbitrary Cloudflare Pages and Workers origins", () => {
    expect(isAllowedEcosystemOrigin("https://attacker.pages.dev")).toBe(false);
    expect(isAllowedEcosystemOrigin("https://attacker.workers.dev")).toBe(false);
  });

  it("allows HTTPS tenant portals on the controlled platform domain only", () => {
    expect(isAllowedEcosystemOrigin("https://colegio-esperanca.portal-siga.com")).toBe(true);
    expect(isAllowedEcosystemOrigin("http://colegio-esperanca.portal-siga.com")).toBe(false);
    expect(isAllowedEcosystemOrigin("https://portal-siga.com.evil.example")).toBe(false);
  });
});
