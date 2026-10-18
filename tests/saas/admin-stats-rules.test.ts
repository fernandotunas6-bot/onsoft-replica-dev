import { describe, expect, it } from "vitest";
import {
  defaultBillingProfile,
  isInTrial,
  isTrialExpired,
  monthlyRevenueOf,
  resolveStatusChange,
} from "@/features/saas/tenant-billing-rules";

const NOW = new Date("2026-10-17T12:00:00Z");
const PLAN = { price_aoa_monthly: 50_000, price_aoa_yearly: 500_000 };
const base = () => defaultBillingProfile("t1");

describe("monthlyRevenueOf (MRR do painel)", () => {
  const revenue = (over: Partial<Parameters<typeof monthlyRevenueOf>[0]>) =>
    monthlyRevenueOf(
      {
        tenantStatus: "active",
        billingExempt: false,
        profile: null,
        plan: PLAN,
        activeStudents: 100,
        ...over,
      },
      NOW,
    );

  it("escola activa com a assinatura ainda em trial não conta (não pagou)", () => {
    expect(revenue({ subscriptionStatus: "trialing" })).toBe(0);
  });

  it("escola activa sem perfil: preço mensal de tabela", () => {
    expect(revenue({})).toBe(50_000);
  });

  it("trial, atraso, suspensa e isenta não contam", () => {
    expect(revenue({ tenantStatus: "trial" })).toBe(0);
    expect(revenue({ tenantStatus: "past_due" })).toBe(0);
    expect(revenue({ tenantStatus: "suspended" })).toBe(0);
    expect(revenue({ billingExempt: true })).toBe(0);
  });

  it("por aluno: valor do período a dividir pelos meses", () => {
    const profile = { ...base(), pricingModel: "per_student" as const, pricePerStudentAoa: 500 };
    expect(revenue({ profile, activeStudents: 200 })).toBe(100_000);
    const quarterly = { ...profile, billingPeriod: "quarterly" as const };
    // 3 meses com 5% de desconto trimestral, a dividir por 3.
    expect(revenue({ profile: quarterly, activeStudents: 200 })).toBe(95_000);
  });

  it("cobrança pausada no perfil: 0", () => {
    const profile = { ...base(), billingPaused: true, billingPausedReason: "Acordo" };
    expect(revenue({ profile })).toBe(0);
  });
});

describe("isTrialExpired", () => {
  it("trial com a data no passado e sem isenção", () => {
    expect(isTrialExpired({ status: "trial", trial_ends_at: "2026-10-01T00:00:00Z" }, NOW)).toBe(
      true,
    );
    expect(isTrialExpired({ status: "trial", trial_ends_at: "2026-11-01T00:00:00Z" }, NOW)).toBe(
      false,
    );
    expect(
      isTrialExpired(
        {
          status: "active",
          subscription_status: "trialing",
          trial_ends_at: "2026-10-01T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      isTrialExpired(
        { status: "trial", trial_ends_at: "2026-10-01T00:00:00Z", billing_exempt: true },
        NOW,
      ),
    ).toBe(false);
    expect(isTrialExpired({ status: "active", subscription_status: "active" }, NOW)).toBe(false);
  });
});

describe("resolveStatusChange", () => {
  it("activar uma escola em atraso pede o registo do pagamento", () => {
    const r = resolveStatusChange(
      { status: "past_due", subscription_status: "past_due" },
      "active",
    );
    expect("error" in r && r.error).toMatch(/pagamento/);
  });

  it("em atraso mas isenta (cobrança pausada) pode ser activada", () => {
    expect(resolveStatusChange({ status: "past_due", billing_exempt: true }, "active")).toEqual({
      status: "active",
    });
  });

  it("suspensa durante o trial volta ao trial", () => {
    expect(
      resolveStatusChange({ status: "suspended", subscription_status: "trialing" }, "active"),
    ).toEqual({ status: "trial" });
  });

  it("suspensa com assinatura paga volta a activa; suspender passa sempre", () => {
    expect(
      resolveStatusChange({ status: "suspended", subscription_status: "active" }, "active"),
    ).toEqual({ status: "active" });
    expect(resolveStatusChange({ status: "active" }, "suspended")).toEqual({ status: "suspended" });
  });
});

describe("isInTrial", () => {
  it("trial, ou activa com a assinatura em trialing", () => {
    expect(isInTrial({ status: "trial" })).toBe(true);
    expect(isInTrial({ status: "active", subscription_status: "trialing" })).toBe(true);
    expect(isInTrial({ status: "active", subscription_status: "active" })).toBe(false);
    expect(isInTrial({ status: "suspended", subscription_status: "trialing" })).toBe(false);
  });
});
