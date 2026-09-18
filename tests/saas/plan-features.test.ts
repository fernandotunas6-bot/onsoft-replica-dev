import { describe, expect, it } from "vitest";
import {
  planIncludesModule,
  planIncludesPath,
  trialDaysRemaining,
  planIncludesCustomDomain,
  planIncludesProfessionalEmail,
  planIncludesAdvancedBranding,
} from "@/features/saas/plan-features";
import type { Plan } from "@/features/saas/types";

const startPlan: Plan = {
  id: "p1",
  name: "Start",
  code: "start",
  description: "",
  max_students: 200,
  max_staff: 10,
  max_storage_gb: 5,
  price_aoa_monthly: 0,
  price_aoa_yearly: 0,
  features: {
    academic: true,
    finance: false,
    attendance: true,
    documents: true,
  },
  is_active: true,
};

describe("planIncludesModule", () => {
  it("allows finance when plan includes finance", () => {
    const plan = {
      ...startPlan,
      features: { ...startPlan.features, finance: true },
    };
    expect(planIncludesModule(plan, "financeiro")).toBe(true);
  });

  it("blocks financeiro when plan excludes finance", () => {
    expect(planIncludesModule(startPlan, "financeiro")).toBe(false);
  });

  it("allows core modules without explicit feature flag", () => {
    expect(planIncludesModule(startPlan, "gestao")).toBe(true);
  });

  it("allows all modules when plan is missing (single-school fallback)", () => {
    expect(planIncludesModule(null, "financeiro")).toBe(true);
  });
});

describe("planIncludesPath", () => {
  it("blocks finance routes on start plan", () => {
    expect(planIncludesPath("/financeiro", startPlan)).toBe(false);
    expect(planIncludesPath("/faturas", startPlan)).toBe(false);
  });

  it("allows pedagogica on start plan", () => {
    expect(planIncludesPath("/pedagogica", startPlan)).toBe(true);
  });
});

describe("trialDaysRemaining", () => {
  it("returns rounded days until trial end", () => {
    const days = trialDaysRemaining(
      "2026-09-01T00:00:00.000Z",
      new Date("2026-08-28T12:00:00.000Z"),
    );
    expect(days).toBe(4);
  });
});

describe("Digital Identity plan features", () => {
  it("planIncludesCustomDomain respects plan tier and explicit flag", () => {
    expect(planIncludesCustomDomain(startPlan)).toBe(false);
    expect(
      planIncludesCustomDomain({
        ...startPlan,
        features: { ...startPlan.features, custom_domain: true },
      }),
    ).toBe(true);
    expect(planIncludesCustomDomain({ ...startPlan, code: "enterprise" })).toBe(true);
    expect(planIncludesCustomDomain(null)).toBe(true);
  });

  it("planIncludesProfessionalEmail allows business and enterprise tiers", () => {
    expect(planIncludesProfessionalEmail(startPlan)).toBe(false);
    expect(planIncludesProfessionalEmail({ ...startPlan, code: "business" })).toBe(true);
    expect(planIncludesProfessionalEmail({ ...startPlan, code: "enterprise" })).toBe(true);
  });

  it("planIncludesAdvancedBranding allows enterprise or custom_domain", () => {
    expect(planIncludesAdvancedBranding(startPlan)).toBe(false);
    expect(planIncludesAdvancedBranding({ ...startPlan, code: "enterprise" })).toBe(true);
    expect(
      planIncludesAdvancedBranding({
        ...startPlan,
        features: { ...startPlan.features, custom_domain: true },
      }),
    ).toBe(true);
  });
});
