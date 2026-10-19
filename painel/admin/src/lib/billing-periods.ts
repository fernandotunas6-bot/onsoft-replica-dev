/**
 * Períodos de cobrança das assinaturas e preços por período.
 *
 * Como nas assinaturas do Claude: a escola escolhe a periodicidade, vê quanto
 * paga no total, o equivalente por mês e quanto poupa face ao mensal. Uma só
 * regra de preço — mensal do plano × meses × (1 − desconto do período),
 * arredondado a 500 Kz — para o site, o SIGA, o PayFlow e o ADMIN darem sempre
 * o mesmo número. A equipa configura os períodos e descontos no ADMIN
 * (`saas_billing_settings`); sem configuração, valem os de `DEFAULT_BILLING`.
 *
 * Lógica pura: sem base, sem React (testada em tests/saas/billing-periods.test.ts).
 * Copiada tal e qual para painel/web e painel/admin (tests/saas/plan-details.test.ts).
 */

export const BILLING_PERIOD_CODES = ["monthly", "quarterly", "semiannual", "yearly"] as const;
export type BillingPeriodCode = (typeof BILLING_PERIOD_CODES)[number];

export const BILLING_PERIOD_MONTHS: Record<BillingPeriodCode, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export const BILLING_PERIOD_LABEL: Record<BillingPeriodCode, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
};

/** «por mês», «por trimestre»… — para «cobrado …». */
export const BILLING_PERIOD_UNIT: Record<BillingPeriodCode, string> = {
  monthly: "mensalmente",
  quarterly: "por trimestre",
  semiannual: "por semestre",
  yearly: "anualmente",
};

export type BillingPeriodConfig = {
  code: BillingPeriodCode;
  enabled: boolean;
  /** 0–50 %, até duas casas decimais (16,67 % = 2 meses grátis no anual). */
  discountPct: number;
};

export type BillingSettings = {
  /** false = a plataforma não cobra nenhuma escola (lançamento, campanha). */
  chargingEnabled: boolean;
  trialDays: number;
  periods: BillingPeriodConfig[];
  /** Mensagem opcional mostrada às escolas enquanto a cobrança está desligada. */
  notice: string | null;
};

export const DEFAULT_BILLING: BillingSettings = {
  chargingEnabled: true,
  trialDays: 14,
  notice: null,
  periods: [
    { code: "monthly", enabled: true, discountPct: 0 },
    { code: "quarterly", enabled: true, discountPct: 5 },
    { code: "semiannual", enabled: true, discountPct: 10 },
    { code: "yearly", enabled: true, discountPct: 16.67 },
  ],
};

export function isBillingPeriodCode(value: unknown): value is BillingPeriodCode {
  return typeof value === "string" && (BILLING_PERIOD_CODES as readonly string[]).includes(value);
}

/**
 * Lê a configuração guardada (colunas snake_case da base ou objecto já
 * normalizado) e completa o que falta com os valores por omissão. Nunca devolve
 * zero períodos activos: o mensal fica sempre disponível.
 */
export function normalizeBillingSettings(raw: unknown): BillingSettings {
  const row = (raw ?? {}) as Record<string, unknown>;
  const storedPeriods = Array.isArray(row["periods"]) ? (row["periods"] as unknown[]) : [];
  const periods = BILLING_PERIOD_CODES.map((code) => {
    const fallback = DEFAULT_BILLING.periods.find((p) => p.code === code)!;
    const stored = storedPeriods.find(
      (p) => (p as Record<string, unknown> | null)?.["code"] === code,
    ) as Record<string, unknown> | undefined;
    if (!stored) return { ...fallback };
    const discount = Number(stored["discount_pct"] ?? stored["discountPct"]);
    return {
      code,
      enabled: stored["enabled"] !== false,
      discountPct: Number.isFinite(discount)
        ? Math.min(50, Math.max(0, Math.round(discount * 100) / 100))
        : fallback.discountPct,
    };
  });
  if (!periods.some((p) => p.enabled)) periods[0]!.enabled = true;
  const trial = Number(row["trial_days"] ?? row["trialDays"]);
  const charging = row["charging_enabled"] ?? row["chargingEnabled"];
  const notice = row["notice"];
  return {
    chargingEnabled: charging !== false,
    trialDays: Number.isFinite(trial) ? Math.min(90, Math.max(0, Math.round(trial))) : 14,
    periods,
    notice: typeof notice === "string" && notice.trim() ? notice.trim().slice(0, 280) : null,
  };
}

/** Para gravar em `saas_billing_settings` (snake_case). */
export function billingSettingsToRow(settings: BillingSettings) {
  return {
    charging_enabled: settings.chargingEnabled,
    trial_days: settings.trialDays,
    notice: settings.notice,
    periods: settings.periods.map((p) => ({
      code: p.code,
      enabled: p.enabled,
      discount_pct: p.discountPct,
    })),
  };
}

export function enabledPeriods(settings: BillingSettings): BillingPeriodConfig[] {
  return settings.periods.filter((p) => p.enabled);
}

const ROUND_TO = 500;

export type PeriodPrice = {
  period: BillingPeriodCode;
  months: number;
  /** Total cobrado por período. */
  total: number;
  /** Equivalente mensal (para «X Kz/mês, cobrado anualmente»). */
  perMonth: number;
  /** Poupança face a pagar mês a mês durante o mesmo tempo. */
  savingsKz: number;
  savingsPct: number;
};

/** Preço de um plano num período; `null` se o plano não tem preço mensal. */
export function periodPrice(
  monthlyPrice: number | null | undefined,
  period: BillingPeriodCode,
  settings: BillingSettings = DEFAULT_BILLING,
): PeriodPrice | null {
  const monthly = Number(monthlyPrice);
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  const months = BILLING_PERIOD_MONTHS[period];
  const discount = settings.periods.find((p) => p.code === period)?.discountPct ?? 0;
  const full = monthly * months;
  const total = Math.max(ROUND_TO, Math.round((full * (1 - discount / 100)) / ROUND_TO) * ROUND_TO);
  const savingsKz = Math.max(0, full - total);
  return {
    period,
    months,
    total,
    perMonth: Math.round(total / months),
    savingsKz,
    savingsPct: full > 0 ? Math.round((savingsKz / full) * 100) : 0,
  };
}

/** Fim do período pago a partir de uma data (mesmo dia, N meses depois). */
export function periodEnd(from: Date, period: BillingPeriodCode): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + BILLING_PERIOD_MONTHS[period]);
  return end;
}

/** Maior poupança entre os períodos activos — para «poupe até X%». */
export function bestSavingsPct(settings: BillingSettings): number {
  return Math.max(0, ...enabledPeriods(settings).map((p) => Math.round(p.discountPct)));
}
