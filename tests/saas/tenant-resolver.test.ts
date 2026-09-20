import { describe, expect, it } from "vitest";
import {
  isLocalDevHostname,
  isPortalSigaHostname,
  resolveTenantLookup,
  getTenantSlugFromHostname,
  isAdminSubdomain,
  isPayflowSubdomain,
} from "@/lib/saas/tenant-resolver";

describe("resolveTenantLookup", () => {
  it("usa slug minha-escola em localhost", () => {
    expect(resolveTenantLookup("localhost")).toEqual({ mode: "slug", slug: "minha-escola" });
  });

  it("extrai subdomínio de portal-siga.com", () => {
    expect(resolveTenantLookup("colegio-horizonte.portal-siga.com")).toEqual({
      mode: "slug",
      slug: "colegio-horizonte",
    });
  });

  it("trata subdomínios reservados www, app e payflow no portal-siga como hostname institucional", () => {
    expect(resolveTenantLookup("www.portal-siga.com")).toEqual({
      mode: "hostname",
      hostname: "www.portal-siga.com",
    });
    expect(resolveTenantLookup("app.portal-siga.com")).toEqual({
      mode: "hostname",
      hostname: "app.portal-siga.com",
    });
    expect(resolveTenantLookup("payflow.portal-siga.com")).toEqual({
      mode: "hostname",
      hostname: "payflow.portal-siga.com",
    });
  });

  it("resolve domínio customizado por hostname completo", () => {
    expect(resolveTenantLookup("portal.colegio.ao")).toEqual({
      mode: "hostname",
      hostname: "portal.colegio.ao",
    });
  });
});

describe("isLocalDevHostname", () => {
  it("reconhece localhost e LAN", () => {
    expect(isLocalDevHostname("localhost")).toBe(true);
    expect(isLocalDevHostname("127.0.0.1")).toBe(true);
    expect(isLocalDevHostname("192.168.1.5")).toBe(true);
    expect(isLocalDevHostname("portal.colegio.ao")).toBe(false);
  });
});

describe("isPortalSigaHostname", () => {
  it("reconhece subdomínios portal-siga", () => {
    expect(isPortalSigaHostname("escola.portal-siga.com")).toBe(true);
    expect(isPortalSigaHostname("portal.colegio.ao")).toBe(false);
  });
});

describe("getTenantSlugFromHostname (compat)", () => {
  it("mantém comportamento para subdomínios", () => {
    expect(getTenantSlugFromHostname("demo.portal-siga.com")).toBe("demo");
  });
});

describe("isAdminSubdomain", () => {
  it("detecta admin e saas-admin", () => {
    expect(isAdminSubdomain("admin.portal-siga.com")).toBe(true);
    expect(isAdminSubdomain("saas-admin.portal-siga.com")).toBe(true);
    expect(isAdminSubdomain("escola.portal-siga.com")).toBe(false);
  });

  it("não marca domínios customizados como admin", () => {
    expect(isAdminSubdomain("admin.colegio.ao")).toBe(false);
  });
});

describe("isPayflowSubdomain", () => {
  it("detecta payflow sob o domínio da plataforma", () => {
    expect(isPayflowSubdomain("payflow.portal-siga.com")).toBe(true);
    expect(isPayflowSubdomain("escola.portal-siga.com")).toBe(false);
    expect(isPayflowSubdomain("payflow.colegio.ao")).toBe(false);
  });
});
