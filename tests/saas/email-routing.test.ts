/**
 * tests/saas/email-routing.test.ts
 *
 * Testes de unidade para o módulo de Email Routing Institucional (Fase 3).
 * Sem chamadas de rede reais — usa vi.stubEnv e vi.stubGlobal.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  buildInstitutionalAddress,
  validateForwardingEmail,
  resolveCloudflareCredentials,
  createEmailRoute,
  type EmailRouteConfig,
} from "../../src/features/saas/email-routing";

// Stub do Supabase para não ligar à BD
vi.mock("../../src/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: vi.fn().mockResolvedValue({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─── buildInstitutionalAddress ───────────────────────────────────────────────

describe("buildInstitutionalAddress", () => {
  it("constrói endereço com slug e domínio explícito", () => {
    expect(buildInstitutionalAddress("esperanca", "siga.ao")).toBe("esperanca@siga.ao");
  });

  it("normaliza o slug para lowercase", () => {
    expect(buildInstitutionalAddress("COLEGIO", "siga.ao")).toBe("colegio@siga.ao");
  });

  it("usa PLATFORM_DOMAIN quando não é fornecido domínio explícito", () => {
    vi.stubEnv("PLATFORM_DOMAIN", "portal-siga.com");
    expect(buildInstitutionalAddress("escola")).toBe("escola@portal-siga.com");
  });

  it("slug com hífenes é válido", () => {
    expect(buildInstitutionalAddress("colegio-esperanca", "siga.ao")).toBe(
      "colegio-esperanca@siga.ao",
    );
  });
});

// ─── validateForwardingEmail ─────────────────────────────────────────────────

describe("validateForwardingEmail", () => {
  it("e-mail válido retorna true", () => {
    expect(validateForwardingEmail("admin@colegio.ao")).toBe(true);
    expect(validateForwardingEmail("direcao@gmail.com")).toBe(true);
    expect(validateForwardingEmail("noreply@siga.ao")).toBe(true);
  });

  it("e-mail inválido retorna false", () => {
    expect(validateForwardingEmail("invalid")).toBe(false);
    expect(validateForwardingEmail("sem@dominio")).toBe(false);
    expect(validateForwardingEmail("")).toBe(false);
    expect(validateForwardingEmail("   ")).toBe(false);
    expect(validateForwardingEmail("@dominio.com")).toBe(false);
  });
});

// ─── resolveCloudflareCredentials ───────────────────────────────────────────

describe("resolveCloudflareCredentials", () => {
  it("retorna null quando variáveis de ambiente estão vazias", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    expect(resolveCloudflareCredentials()).toBeNull();
  });

  it("retorna null quando apenas algumas variáveis estão definidas", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc-123");
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok-abc");
    expect(resolveCloudflareCredentials()).toBeNull();
  });

  it("retorna credenciais quando todas as variáveis estão presentes", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc-123");
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone-456");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok-abc");
    const creds = resolveCloudflareCredentials();
    expect(creds).not.toBeNull();
    expect(creds?.accountId).toBe("acc-123");
    expect(creds?.zoneId).toBe("zone-456");
    expect(creds?.apiToken).toBe("tok-abc");
  });
});

// ─── createEmailRoute ────────────────────────────────────────────────────────

describe("createEmailRoute — modo simulado (sem credenciais Cloudflare)", () => {
  beforeEach(() => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
  });

  const validConfig: EmailRouteConfig = {
    institutionalAddress: "esperanca@siga.ao",
    forwardTo: "direcao@gmail.com",
    tenantSlug: "esperanca",
    tenantId: "ten-001",
  };

  it("retorna ok=true com provider=simulated quando sem credenciais", async () => {
    const result = await createEmailRoute(validConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("simulated");
    }
  });

  it("retorna ok=false se forwardTo for inválido", async () => {
    const result = await createEmailRoute({ ...validConfig, forwardTo: "invalid" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("inválido");
    }
  });

  it("retorna ok=false se institutionalAddress for inválido", async () => {
    const result = await createEmailRoute({ ...validConfig, institutionalAddress: "invalido" });
    expect(result.ok).toBe(false);
  });
});
