import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isRateLimitBypassed, checkRateLimit, recordRateLimitAttempt } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/request-ip";

describe("Rate Limit Security Hardening", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("never bypasses rate limit in production even with siga-plus.test suffix", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SIGA_E2E_LIVE;

    expect(isRateLimitBypassed("user@siga-plus.test")).toBe(false);
    expect(isRateLimitBypassed("ip:127.0.0.1", "test@siga-plus.test")).toBe(false);
  });

  it("allows test bypass strictly when not in production or when SIGA_E2E_LIVE is explicitly set", () => {
    process.env.NODE_ENV = "test";
    process.env.SIGA_E2E_LIVE = "1";

    expect(isRateLimitBypassed("random@example.com")).toBe(true);
  });

  it("enforces sliding window rate limit correctly", () => {
    const key = `test_key_${Date.now()}`;
    const opts = { windowMs: 1000, max: 2 };

    expect(checkRateLimit([key], opts)).toBe(true);
    recordRateLimitAttempt([key], opts);

    expect(checkRateLimit([key], opts)).toBe(true);
    recordRateLimitAttempt([key], opts);

    // Exceeded max=2
    expect(checkRateLimit([key], opts)).toBe(false);
  });
});

describe("Client IP Extraction Security", () => {
  it("prioritizes tamper-proof cf-connecting-ip over x-forwarded-for", () => {
    const req = new Request("https://portal-siga.com/api/test", {
      headers: {
        "cf-connecting-ip": "198.51.100.25",
        "x-real-ip": "192.0.2.1",
        "x-forwarded-for": "203.0.113.195, 10.0.0.1",
      },
    });

    expect(clientIpFromRequest(req)).toBe("198.51.100.25");
  });

  it("falls back to x-real-ip when cf-connecting-ip is missing", () => {
    const req = new Request("https://portal-siga.com/api/test", {
      headers: {
        "x-real-ip": "192.0.2.1",
        "x-forwarded-for": "203.0.113.195, 10.0.0.1",
      },
    });

    expect(clientIpFromRequest(req)).toBe("192.0.2.1");
  });

  it("falls back to first x-forwarded-for ip when others missing", () => {
    const req = new Request("https://portal-siga.com/api/test", {
      headers: {
        "x-forwarded-for": "203.0.113.195, 10.0.0.1",
      },
    });

    expect(clientIpFromRequest(req)).toBe("203.0.113.195");
  });

  it("returns unknown when no IP headers exist", () => {
    const req = new Request("https://portal-siga.com/api/test");
    expect(clientIpFromRequest(req)).toBe("unknown");
  });
});

describe("Invitation Recipient Protection Logic", () => {
  function validateInvitationRecipient(userEmail: string | undefined, invitedEmail: string): boolean {
    const uEmail = userEmail?.toLowerCase().trim();
    const iEmail = invitedEmail.toLowerCase().trim();
    if (uEmail && uEmail !== iEmail) {
      return false;
    }
    return true;
  }

  it("accepts invitation when authenticated session matches invited email", () => {
    expect(
      validateInvitationRecipient("professor@escola.ao", "professor@escola.ao")
    ).toBe(true);
  });

  it("rejects invitation when authenticated session belongs to a different email", () => {
    expect(
      validateInvitationRecipient("attacker@externo.com", "professor@escola.ao")
    ).toBe(false);
  });
});
