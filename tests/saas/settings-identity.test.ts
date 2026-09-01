/**
 * tests/saas/settings-identity.test.ts
 *
 * Testes de unidade para a integração do DigitalIdentityPanel com as
 * lógicas de plano, domínio centralizado e helpers de slug.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getPlatformDomain, getPlatformSubdomain } from "../../src/lib/saas/platform-domain";
import {
  planIncludesCustomDomain,
  planIncludesProfessionalEmail,
  planIncludesAdvancedBranding,
} from "../../src/features/saas/plan-features";
import type { Plan } from "../../src/features/saas/types";

// ---------- fixtures ----------
const makePlan = (overrides: Partial<Plan>): Plan => ({
  id: "plan-test",
  name: "Test Plan",
  slug: "test",
  code: "starter",
  price_monthly: 0,
  price_yearly: 0,
  max_students: 100,
  max_storage_gb: 1,
  features: {},
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// ---------- domínio ----------
describe("DigitalIdentityPanel — domínio e subdomínio", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getPlatformDomain usa PLATFORM_DOMAIN de env", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "siga.ao");
    expect(getPlatformDomain()).toBe("siga.ao");
  });

  it("getPlatformDomain usa VITE_PLATFORM_DOMAIN como fallback", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "");
    vi.stubEnv("VITE_PLATFORM_DOMAIN", "portal-siga.com");
    expect(getPlatformDomain()).toBe("portal-siga.com");
  });

  it("getPlatformSubdomain constrói URL correctamente para slug da escola", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "siga.ao");
    const url = getPlatformSubdomain("esperanca");
    expect(url).toBe("esperanca.siga.ao");
  });

  it("getPlatformSubdomain não duplica o domínio", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "portal-siga.com");
    const result = getPlatformSubdomain("abc");
    expect(result.split(".portal-siga.com").length - 1).toBe(1);
  });
});

// ---------- feature gates ----------
describe("DigitalIdentityPanel — feature gates por plano", () => {
  it("plano null retorna true (modo dev/demo — tudo activo)", () => {
    // Sem plano carregado a escola pode usar tudo — modo single tenant
    expect(planIncludesCustomDomain(null)).toBe(true);
    expect(planIncludesProfessionalEmail(null)).toBe(true);
    expect(planIncludesAdvancedBranding(null)).toBe(true);
  });

  it("plano starter não tem domínio personalizado", () => {
    const plan = makePlan({ code: "starter", features: {} });
    expect(planIncludesCustomDomain(plan)).toBe(false);
  });

  it("plano business tem domínio personalizado", () => {
    const plan = makePlan({ code: "business", features: {} });
    expect(planIncludesCustomDomain(plan)).toBe(true);
  });

  it("plano enterprise tem domínio personalizado", () => {
    const plan = makePlan({ code: "enterprise", features: {} });
    expect(planIncludesCustomDomain(plan)).toBe(true);
  });

  it("plano starter com custom_domain explícito nas features tem domínio personalizado", () => {
    const plan = makePlan({ code: "starter", features: { custom_domain: true } });
    expect(planIncludesCustomDomain(plan)).toBe(true);
  });

  it("plano starter não tem e-mail profissional", () => {
    const plan = makePlan({ code: "starter", features: {} });
    expect(planIncludesProfessionalEmail(plan)).toBe(false);
  });

  it("plano business tem e-mail profissional", () => {
    const plan = makePlan({ code: "business", features: {} });
    expect(planIncludesProfessionalEmail(plan)).toBe(true);
  });

  it("plano enterprise tem e-mail profissional", () => {
    const plan = makePlan({ code: "enterprise", features: {} });
    expect(planIncludesProfessionalEmail(plan)).toBe(true);
  });

  it("plano starter não tem branding avançado", () => {
    const plan = makePlan({ code: "starter", features: {} });
    expect(planIncludesAdvancedBranding(plan)).toBe(false);
  });

  it("plano enterprise tem branding avançado", () => {
    const plan = makePlan({ code: "enterprise", features: {} });
    expect(planIncludesAdvancedBranding(plan)).toBe(true);
  });

  it("plano com custom_domain nas features tem branding avançado", () => {
    const plan = makePlan({ code: "starter", features: { custom_domain: true } });
    expect(planIncludesAdvancedBranding(plan)).toBe(true);
  });
});

// ---------- e-mail institucional ----------
describe("DigitalIdentityPanel — e-mail institucional", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("endereço institucional composto correctamente", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "siga.ao");
    const slug = "esperanca";
    const domain = getPlatformDomain();
    const email = `${slug}@${domain}`;
    expect(email).toBe("esperanca@siga.ao");
  });

  it("slug com hífenes gera endereço de e-mail válido", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "portal-siga.com");
    const slug = "colegio-santo-antonio";
    const email = `${slug}@${getPlatformDomain()}`;
    expect(email).toBe("colegio-santo-antonio@portal-siga.com");
    expect(email).toMatch(/^[\w-]+@[\w.-]+\.\w{2,}$/);
  });
});
