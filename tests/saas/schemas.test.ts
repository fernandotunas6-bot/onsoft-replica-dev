import { describe, expect, it } from "vitest";
import {
  createSchoolWizardInputSchema,
  publicSchoolSignupInputSchema,
  tenantSlugInputSchema,
  updateTenantStatusInputSchema,
  updateTenantSubscriptionInputSchema,
  grantPlatformAdminInputSchema,
  revokePlatformAdminInputSchema,
  registerTenantDomainInputSchema,
  updateTenantDomainStatusInputSchema,
} from "@/features/saas/schemas";

describe("SaaS Control Center schemas", () => {
  it("validates a complete school wizard payload", () => {
    const parsed = createSchoolWizardInputSchema.parse({
      name: "Colégio Horizonte",
      nif: "5417000000",
      contact_name: "Dr. Manuel K.",
      contact_email: "direcao@horizonte.co.ao",
      plan_code: "professional",
      trial_days: 14,
      slug: "horizonte",
      admin_name: "Dr. Manuel K.",
      admin_email: "direcao@horizonte.co.ao",
    });
    expect(parsed.slug).toBe("horizonte");
    expect(parsed.trial_days).toBe(14);
  });

  it("rejects a slug with invalid characters", () => {
    expect(() =>
      createSchoolWizardInputSchema.parse({
        name: "Colégio Horizonte",
        nif: "5417000000",
        contact_name: "Dr. Manuel K.",
        contact_email: "direcao@horizonte.co.ao",
        plan_code: "professional",
        slug: "Horizonte SIGA!",
        admin_name: "Dr. Manuel K.",
        admin_email: "direcao@horizonte.co.ao",
      }),
    ).toThrow();
  });

  it("rejects reserved subdomains like admin, api, www", () => {
    for (const reserved of ["admin", "api", "www", "app", "auth", "mail", "billing"]) {
      expect(() =>
        createSchoolWizardInputSchema.parse({
          name: "Colégio Teste",
          nif: "5417000000",
          contact_name: "Responsável",
          contact_email: "teste@escola.ao",
          plan_code: "start",
          slug: reserved,
          admin_name: "Admin",
          admin_email: "admin@escola.ao",
        }),
      ).toThrow();
    }
  });

  it("rejects an invalid admin e-mail", () => {
    expect(() =>
      createSchoolWizardInputSchema.parse({
        name: "Colégio Horizonte",
        nif: "5417000000",
        contact_name: "Dr. Manuel K.",
        contact_email: "direcao@horizonte.co.ao",
        plan_code: "professional",
        slug: "horizonte",
        admin_name: "Dr. Manuel K.",
        admin_email: "nao-e-email",
      }),
    ).toThrow();
  });

  it("validates a tenant status update", () => {
    const parsed = updateTenantStatusInputSchema.parse({
      tenantId: "11111111-1111-1111-1111-111111111111",
      status: "suspended",
    });
    expect(parsed.status).toBe("suspended");
  });

  it("validates a tenant subscription update with plan or trial extension", () => {
    const parsed = updateTenantSubscriptionInputSchema.parse({
      tenantId: "11111111-1111-1111-1111-111111111111",
      plan_code: "professional",
      extend_trial_days: 14,
    });
    expect(parsed.plan_code).toBe("professional");
    expect(parsed.extend_trial_days).toBe(14);
  });

  it("rejects subscription update without plan or trial extension", () => {
    expect(() =>
      updateTenantSubscriptionInputSchema.parse({
        tenantId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toThrow();
  });

  it("validates grant platform admin by email", () => {
    const parsed = grantPlatformAdminInputSchema.parse({ email: "admin@siga.ao" });
    expect(parsed.email).toBe("admin@siga.ao");
  });

  it("validates revoke platform admin by userId", () => {
    const parsed = revokePlatformAdminInputSchema.parse({
      userId: "11111111-1111-1111-1111-111111111111",
    });
    expect(parsed.userId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("validates register tenant custom domain", () => {
    const parsed = registerTenantDomainInputSchema.parse({
      tenantId: "11111111-1111-1111-1111-111111111111",
      hostname: "portal.colegio.ao",
    });
    expect(parsed.hostname).toBe("portal.colegio.ao");
  });

  it("validates tenant domain status update", () => {
    const parsed = updateTenantDomainStatusInputSchema.parse({
      domainId: "22222222-2222-2222-2222-222222222222",
      status: "active",
    });
    expect(parsed.status).toBe("active");
  });

  it("normalizes a tenant slug lookup to lowercase", () => {
    const parsed = tenantSlugInputSchema.parse({ slug: "Horizonte" });
    expect(parsed.slug).toBe("horizonte");
  });

  it("rejects an empty tenant slug", () => {
    expect(() => tenantSlugInputSchema.parse({ slug: "" })).toThrow();
  });

  it("accepts a public signup payload without trial_days", () => {
    const parsed = publicSchoolSignupInputSchema.parse({
      name: "Colégio Horizonte",
      nif: "5417000000",
      contact_name: "Dr. Manuel K.",
      contact_email: "direcao@horizonte.co.ao",
      plan_code: "start",
      slug: "horizonte",
      admin_name: "Dr. Manuel K.",
      admin_email: "direcao@horizonte.co.ao",
      admin_password: "senha-forte-123",
    });
    expect(parsed).not.toHaveProperty("trial_days");
  });

  it("rejects a public signup payload without admin_password", () => {
    expect(() =>
      publicSchoolSignupInputSchema.parse({
        name: "Colégio Horizonte",
        nif: "5417000000",
        contact_name: "Dr. Manuel K.",
        contact_email: "direcao@horizonte.co.ao",
        plan_code: "start",
        slug: "horizonte",
        admin_name: "Dr. Manuel K.",
        admin_email: "direcao@horizonte.co.ao",
      }),
    ).toThrow();
  });

  it("rejects a public signup payload with a short admin_password", () => {
    expect(() =>
      publicSchoolSignupInputSchema.parse({
        name: "Colégio Horizonte",
        nif: "5417000000",
        contact_name: "Dr. Manuel K.",
        contact_email: "direcao@horizonte.co.ao",
        plan_code: "start",
        slug: "horizonte",
        admin_name: "Dr. Manuel K.",
        admin_email: "direcao@horizonte.co.ao",
        admin_password: "curta",
      }),
    ).toThrow();
  });

  it("rejects a public signup payload with the honeypot field filled", () => {
    expect(() =>
      publicSchoolSignupInputSchema.parse({
        name: "Colégio Horizonte",
        nif: "5417000000",
        contact_name: "Dr. Manuel K.",
        contact_email: "direcao@horizonte.co.ao",
        plan_code: "start",
        slug: "horizonte",
        admin_name: "Dr. Manuel K.",
        admin_email: "direcao@horizonte.co.ao",
        admin_password: "senha-forte-123",
        website: "http://bot-filled-this.example",
      }),
    ).toThrow();
  });
});
