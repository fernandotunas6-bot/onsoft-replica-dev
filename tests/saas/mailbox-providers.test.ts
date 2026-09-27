import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMailbox,
  resolveMailboxProvider,
  suspendMailbox,
} from "@/features/saas/mailbox-providers";

describe("Mailbox Providers", () => {
  beforeEach(() => {
    vi.stubEnv("MAILBOX_PROVIDER", "simulated");
  });

  it("should resolve provider correctly", () => {
    expect(resolveMailboxProvider()).toBe("simulated");

    vi.stubEnv("MAILBOX_PROVIDER", "zoho");
    expect(resolveMailboxProvider()).toBe("zoho");

    vi.stubEnv("MAILBOX_PROVIDER", "google");
    expect(resolveMailboxProvider()).toBe("google");

    vi.stubEnv("MAILBOX_PROVIDER", "unknown");
    expect(resolveMailboxProvider()).toBe("simulated"); // fallback
  });

  it("should create simulated mailbox by default", async () => {
    const result = await createMailbox({
      tenantId: "123",
      tenantSlug: "escola1",
      email: "admin@escola1.siga.ao",
      displayName: "Escola 1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("simulated");
      expect(result.providerAccountId).toContain("sim-");
    }
  });

  it("should suspend simulated mailbox", async () => {
    const result = await suspendMailbox("sim-123", "simulated");
    expect(result.ok).toBe(true);
  });
});

describe("sem caixas de correio fingidas", () => {
  const config = {
    tenantId: "123",
    tenantSlug: "escola1",
    email: "admin@escola1.siga.ao",
    displayName: "Escola 1",
  };

  it("em produção, sem fornecedor configurado, não cria nada", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAILBOX_PROVIDER", "");
    const result = await createMailbox(config);
    expect(result.ok).toBe(false);
    expect((await suspendMailbox("sim-1", "simulated")).ok).toBe(false);
    vi.unstubAllEnvs();
  });

  it("Zoho com credenciais não finge sucesso enquanto a API não estiver ligada", async () => {
    vi.stubEnv("MAILBOX_PROVIDER", "zoho");
    vi.stubEnv("ZOHO_MAIL_ORG_ID", "o");
    vi.stubEnv("ZOHO_MAIL_CLIENT_ID", "c");
    vi.stubEnv("ZOHO_MAIL_CLIENT_SECRET", "s");
    vi.stubEnv("ZOHO_MAIL_REFRESH_TOKEN", "t");
    const result = await createMailbox(config);
    expect(result.ok).toBe(false);
    vi.unstubAllEnvs();
  });
});
