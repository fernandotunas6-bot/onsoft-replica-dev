import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMailbox, resolveMailboxProvider, suspendMailbox } from "@/features/saas/mailbox-providers";

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
