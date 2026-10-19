import { describe, expect, it } from "vitest";
import {
  DEFAULT_BILLING,
  bestSavingsPct,
  billingSettingsToRow,
  enabledPeriods,
  isBillingPeriodCode,
  normalizeBillingSettings,
  periodEnd,
  periodPrice,
} from "@/features/saas/billing-periods";

describe("preço por período", () => {
  it("anual com 16,67 % dá o preço do catálogo (10 × mensal)", () => {
    expect(periodPrice(50_000, "yearly")?.total).toBe(500_000);
    expect(periodPrice(120_000, "yearly")?.total).toBe(1_200_000);
    expect(periodPrice("250000.00" as unknown as number, "yearly")?.total).toBe(2_500_000);
  });

  it("mostra equivalente mensal e poupança, como no Claude", () => {
    const yearly = periodPrice(120_000, "yearly")!;
    expect(yearly.perMonth).toBe(100_000);
    expect(yearly.savingsKz).toBe(240_000);
    expect(yearly.savingsPct).toBe(17);
    const monthly = periodPrice(120_000, "monthly")!;
    expect(monthly).toMatchObject({ total: 120_000, perMonth: 120_000, savingsKz: 0 });
  });

  it("trimestral e semestral arredondam a 500 Kz", () => {
    expect(periodPrice(50_000, "quarterly")?.total).toBe(142_500);
    expect(periodPrice(50_000, "semiannual")?.total).toBe(270_000);
  });

  it("plano sem preço não tem período", () => {
    expect(periodPrice(0, "monthly")).toBeNull();
    expect(periodPrice(null, "yearly")).toBeNull();
  });

  it("usa o desconto configurado", () => {
    const settings = normalizeBillingSettings({
      periods: [{ code: "yearly", enabled: true, discount_pct: 25 }],
    });
    expect(periodPrice(100_000, "yearly", settings)?.total).toBe(900_000);
  });
});

describe("configuração guardada", () => {
  it("sem linha vale o padrão", () => {
    expect(normalizeBillingSettings(null)).toEqual(DEFAULT_BILLING);
  });

  it("lê snake_case e limita valores", () => {
    const s = normalizeBillingSettings({
      charging_enabled: false,
      trial_days: 400,
      notice: "  Grátis até Janeiro  ",
      periods: [
        { code: "monthly", enabled: false, discount_pct: 0 },
        { code: "quarterly", enabled: false, discount_pct: 90 },
        { code: "semiannual", enabled: false },
        { code: "yearly", enabled: false, discount_pct: -3 },
      ],
    });
    expect(s.chargingEnabled).toBe(false);
    expect(s.trialDays).toBe(90);
    expect(s.notice).toBe("Grátis até Janeiro");
    // Nunca zero períodos: o mensal volta a ficar activo.
    expect(enabledPeriods(s).map((p) => p.code)).toEqual(["monthly"]);
    expect(s.periods.find((p) => p.code === "quarterly")?.discountPct).toBe(50);
    expect(s.periods.find((p) => p.code === "yearly")?.discountPct).toBe(0);
  });

  it("ida e volta pela linha da base", () => {
    expect(normalizeBillingSettings(billingSettingsToRow(DEFAULT_BILLING))).toEqual(
      DEFAULT_BILLING,
    );
  });

  it("maior poupança e códigos válidos", () => {
    expect(bestSavingsPct(DEFAULT_BILLING)).toBe(17);
    expect(isBillingPeriodCode("yearly")).toBe(true);
    expect(isBillingPeriodCode("weekly")).toBe(false);
  });

  it("fim do período soma os meses", () => {
    const end = periodEnd(new Date("2026-01-15T10:00:00Z"), "quarterly");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-15");
  });
});
