import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { runPublicSchoolSignup } from "@/features/saas/public-signup";
import { provisionTenantCore } from "@/features/saas/provisioning-core";
import { validatePublicSchoolSignup } from "@/features/saas/schemas";

// Mock provisionTenantCore to avoid actually touching DB during these logic tests
vi.mock("@/features/saas/provisioning-core", () => ({
  provisionTenantCore: vi.fn().mockResolvedValue({
    success: true,
    tenantId: "11111111-1111-1111-1111-111111111111",
    bootstrapSeeded: ["academic_years", "roles"],
  }),
}));

describe("runPublicSchoolSignup logic", () => {
  const baseData = {
    school_name: "Escola Nova",
    slug: "escola-nova",
    contact_name: "Admin",
    contact_email: "test@example.com",
    contact_phone: "912345678",
    website: "", // Honeypot must be empty
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite o signup normal (chamando o provisionTenantCore sem honeypot)", async () => {
    const res = await runPublicSchoolSignup(baseData, "127.0.0.1");
    expect(res.success).toBe(true);
    expect(res.slug).toBe("escola-nova");
    expect(res.hostname).toBe("escola-nova.portal-siga.com");
    expect(provisionTenantCore).toHaveBeenCalledWith(
      {
        school_name: "Escola Nova",
        slug: "escola-nova",
        contact_name: "Admin",
        contact_email: "test@example.com",
        contact_phone: "912345678",
        trial_days: 14,
      },
      { auditUserId: null, source: "public_signup" },
    );
  });

  it("bloqueia tentativas de rate-limit por IP", async () => {
    // 3 tentativas bem-sucedidas
    await runPublicSchoolSignup({ ...baseData, contact_email: "a@ex.com" }, "192.168.1.1");
    await runPublicSchoolSignup({ ...baseData, contact_email: "b@ex.com" }, "192.168.1.1");
    await runPublicSchoolSignup({ ...baseData, contact_email: "c@ex.com" }, "192.168.1.1");

    // A 4ª deve falhar, pois o limite é 3 por IP/Email no prazo de 1h
    await expect(
      runPublicSchoolSignup({ ...baseData, contact_email: "d@ex.com" }, "192.168.1.1"),
    ).rejects.toThrow(/Muitos pedidos/i);

    // Passada 1h e 1 minuto
    vi.advanceTimersByTime(60 * 60 * 1000 + 60000);

    // A próxima tentativa passa (rate-limit expirou)
    const res = await runPublicSchoolSignup(
      { ...baseData, contact_email: "e@ex.com" },
      "192.168.1.1",
    );
    expect(res.success).toBe(true);
  });

  it("bloqueia tentativas de rate-limit por Email (mesmo com IPs diferentes)", async () => {
    await runPublicSchoolSignup({ ...baseData, contact_email: "limit@ex.com" }, "10.0.0.1");
    await runPublicSchoolSignup({ ...baseData, contact_email: "limit@ex.com" }, "10.0.0.2");
    await runPublicSchoolSignup({ ...baseData, contact_email: "limit@ex.com" }, "10.0.0.3");

    // 4ª falha porque o email já foi usado 3x
    await expect(
      runPublicSchoolSignup({ ...baseData, contact_email: "limit@ex.com" }, "10.0.0.4"),
    ).rejects.toThrow(/Muitos pedidos/i);
  });
});
