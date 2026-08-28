import { describe, expect, it } from "vitest";
import {
  createSchoolWizardInputSchema,
  publicSchoolSignupInputSchema,
  tenantSlugInputSchema,
  updateTenantStatusInputSchema,
} from "@/features/saas/schemas";

describe("SaaS Control Center schemas", () => {
  it("validates a complete school wizard payload", () => {
    const parsed = createSchoolWizardInputSchema.parse({
      name: "Colégio Horizonte",
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
        contact_name: "Dr. Manuel K.",
        contact_email: "direcao@horizonte.co.ao",
        plan_code: "professional",
        slug: "Horizonte SIGA!",
        admin_name: "Dr. Manuel K.",
        admin_email: "direcao@horizonte.co.ao",
      }),
    ).toThrow();
  });

  it("rejects an invalid admin e-mail", () => {
    expect(() =>
      createSchoolWizardInputSchema.parse({
        name: "Colégio Horizonte",
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
      contact_name: "Dr. Manuel K.",
      contact_email: "direcao@horizonte.co.ao",
      plan_code: "start",
      slug: "horizonte",
      admin_name: "Dr. Manuel K.",
      admin_email: "direcao@horizonte.co.ao",
    });
    expect(parsed).not.toHaveProperty("trial_days");
  });

  it("rejects a public signup payload with the honeypot field filled", () => {
    expect(() =>
      publicSchoolSignupInputSchema.parse({
        name: "Colégio Horizonte",
        contact_name: "Dr. Manuel K.",
        contact_email: "direcao@horizonte.co.ao",
        plan_code: "start",
        slug: "horizonte",
        admin_name: "Dr. Manuel K.",
        admin_email: "direcao@horizonte.co.ao",
        website: "http://bot-filled-this.example",
      }),
    ).toThrow();
  });
});
