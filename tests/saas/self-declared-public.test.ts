import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  initBillingProfileForNewSchool,
  SELF_DECLARED_PUBLIC_PAUSE_DAYS,
} from "@/features/saas/tenant-billing";
import { schoolDateInDays } from "@/lib/school-date";

/**
 * Uma escola privada que escolhesse «pública» no registo ficava isenta sem fim
 * (sem fim de trial nem atraso) enquanto ninguém a revisse.
 */
describe("escola que se declara pública no registo", () => {
  it("fica com a pausa limitada, não isenta sem fim", async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const db = {
      from: () => {
        const chain: Record<string, unknown> = {};
        chain["upsert"] = (values: Record<string, unknown>) => {
          upserts.push(values);
          return chain;
        };
        for (const m of ["select", "eq", "update"]) chain[m] = () => chain;
        chain["maybeSingle"] = async () => ({
          data: { tenant_id: "t1", ...upserts[0] },
          error: null,
        });
        chain["then"] = (resolve: (r: unknown) => void) => resolve({ error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
    await initBillingProfileForNewSchool(db, "t1", "publica");
    expect(upserts[0]).toMatchObject({
      billing_paused: true,
      billing_paused_until: schoolDateInDays(SELF_DECLARED_PUBLIC_PAUSE_DAYS),
      public_review_status: "pending",
    });
  });

  it("a cobrança ao PayFlow muda de chave quando muda o valor", () => {
    const source = readFileSync("src/features/saas/subscription-server.ts", "utf8");
    expect(source).toMatch(/"Idempotency-Key": `siga-sub-[^`]*\$\{amountCents\}`/);
    expect(source).toContain("schoolTodayIso().slice(0, 7)");
  });
});

describe("descontos por período do ADMIN", () => {
  it("a escola vê o valor com o desconto que o ADMIN definiu", async () => {
    const { defaultBillingProfile, describeTenantBilling } =
      await import("@/features/saas/tenant-billing-rules");
    const profile = {
      ...defaultBillingProfile("t1"),
      pricingModel: "fixed" as const,
      fixedAmountAoa: 100_000,
    };
    const now = new Date("2026-10-17T10:00:00Z");
    const code = describeTenantBilling(profile, null, 0, now);
    const admin = describeTenantBilling(profile, null, 0, now, { yearly: 0 });
    // Sem desconto anual (definido no ADMIN): 12 meses inteiros.
    expect(admin.customByPeriodKz?.yearly).toBe(1_200_000);
    expect(code.customByPeriodKz?.yearly).toBeLessThan(1_200_000);
  });
});
