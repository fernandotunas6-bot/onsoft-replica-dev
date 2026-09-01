/**
 * tests/saas/domain-polling.test.ts
 *
 * Testes de unidade para o módulo de polling DNS (Fase 4).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  shouldRetryCheck,
  calculateNextCheckDelay,
  pollCustomDomainDns,
  type DomainPollState,
} from "../../src/features/saas/domain-polling";

// Mock do verifyCustomDomainDns para não fazer DNS real
vi.mock("../../src/features/saas/domain-verify", () => ({
  verifyCustomDomainDns: vi.fn().mockRejectedValue(new Error("ENOTFOUND")),
  expectedCnameTarget: vi.fn().mockReturnValue("test.portal-siga.com"),
  dnsVerifyTxtHost: vi.fn((host: string) => `_siga-verify.${host}`),
  dnsVerifyToken: vi.fn((id: string) => `siga-verify=${id}`),
  domainDnsInstructions: vi.fn().mockReturnValue({}),
}));

const makeState = (overrides: Partial<DomainPollState> = {}): DomainPollState => ({
  domainId: "dom-001",
  hostname: "portal.escola.ao",
  tenantSlug: "escola",
  tenantId: "ten-001",
  status: "pending",
  lastCheckedAt: null,
  checkCount: 0,
  ...overrides,
});

// ─── shouldRetryCheck ────────────────────────────────────────────────────────

describe("shouldRetryCheck", () => {
  it("retorna false se status for active", () => {
    expect(shouldRetryCheck(makeState({ status: "active" }))).toBe(false);
  });

  it("retorna false se checkCount atingiu o máximo", () => {
    expect(shouldRetryCheck(makeState({ checkCount: 48 }), 48)).toBe(false);
    expect(shouldRetryCheck(makeState({ checkCount: 100 }), 48)).toBe(false);
  });

  it("retorna true se status for pending e não atingiu o máximo", () => {
    expect(shouldRetryCheck(makeState({ status: "pending", checkCount: 0 }))).toBe(true);
    expect(shouldRetryCheck(makeState({ status: "pending", checkCount: 10 }))).toBe(true);
  });

  it("retorna true se status for failed e não atingiu o máximo", () => {
    expect(shouldRetryCheck(makeState({ status: "failed", checkCount: 5 }))).toBe(true);
  });

  it("respeita maxAttempts personalizado", () => {
    expect(shouldRetryCheck(makeState({ checkCount: 5 }), 5)).toBe(false);
    expect(shouldRetryCheck(makeState({ checkCount: 4 }), 5)).toBe(true);
  });
});

// ─── calculateNextCheckDelay ─────────────────────────────────────────────────

describe("calculateNextCheckDelay", () => {
  it("tentativas 1-5 retornam 30 segundos", () => {
    expect(calculateNextCheckDelay(1)).toBe(30_000);
    expect(calculateNextCheckDelay(3)).toBe(30_000);
    expect(calculateNextCheckDelay(5)).toBe(30_000);
  });

  it("tentativas 6-12 retornam 2 minutos", () => {
    expect(calculateNextCheckDelay(6)).toBe(120_000);
    expect(calculateNextCheckDelay(10)).toBe(120_000);
    expect(calculateNextCheckDelay(12)).toBe(120_000);
  });

  it("tentativas 13+ retornam 10 minutos", () => {
    expect(calculateNextCheckDelay(13)).toBe(600_000);
    expect(calculateNextCheckDelay(48)).toBe(600_000);
    expect(calculateNextCheckDelay(100)).toBe(600_000);
  });
});

// ─── pollCustomDomainDns ─────────────────────────────────────────────────────

describe("pollCustomDomainDns", () => {
  afterEach(() => vi.clearAllMocks());

  it("retorna active imediatamente se já estava activo", async () => {
    const result = await pollCustomDomainDns(makeState({ status: "active" }));
    expect(result.status).toBe("active");
    expect("method" in result).toBe(true);
  });

  it("retorna pending (não lança) quando DNS falha com ENOTFOUND", async () => {
    const result = await pollCustomDomainDns(makeState({ checkCount: 5 }));
    // Não deve lançar — deve retornar status pending ou failed
    expect(["pending", "failed"]).toContain(result.status);
    expect("reason" in result).toBe(true);
  });

  it("retorna failed quando checkCount >= 48 e DNS falha", async () => {
    const result = await pollCustomDomainDns(makeState({ checkCount: 48 }));
    expect(result.status).toBe("failed");
  });

  it("resultado contém sempre checkedAt como ISO string", async () => {
    const result = await pollCustomDomainDns(makeState());
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
