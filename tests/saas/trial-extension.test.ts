import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trialExtensionAllowed } from "@/features/saas/platform-ops";

describe("prolongar o trial no ADMIN", () => {
  it("só se prolonga um trial, nunca uma assinatura paga", () => {
    expect(trialExtensionAllowed({ status: "trial", subscription_status: "trialing" })).toBe(true);
    expect(trialExtensionAllowed({ status: "suspended", subscription_status: "trialing" })).toBe(
      true,
    );
    expect(trialExtensionAllowed({ status: "active", subscription_status: "active" })).toBe(false);
    expect(trialExtensionAllowed({ status: "past_due", subscription_status: "past_due" })).toBe(
      false,
    );
    expect(trialExtensionAllowed({ status: "active", subscription_status: null })).toBe(false);
  });

  it("o mesmo pagamento (mesma referência) não soma dois períodos", () => {
    const source = readFileSync("src/features/saas/platform-ops.ts", "utf8");
    const fn = source.slice(source.indexOf("export async function updateTenantSubscription"));
    const check = fn.indexOf('.eq("metadata->>payment_reference"');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(fn.indexOf('.from("tenants").update(patch)'));
  });
});

describe("fim do período pago", () => {
  it("um mês a partir de 31 de Janeiro acaba no fim de Fevereiro", async () => {
    const { addMonthsClamped } = await import("@/features/saas/platform-ops");
    const iso = (d: Date) => d.toISOString();
    expect(iso(addMonthsClamped(new Date("2026-01-31T10:00:00Z"), 1))).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(iso(addMonthsClamped(new Date("2026-01-15T10:00:00Z"), 1))).toBe(
      "2026-02-15T10:00:00.000Z",
    );
    expect(iso(addMonthsClamped(new Date("2026-08-31T10:00:00Z"), 6))).toBe(
      "2027-02-28T10:00:00.000Z",
    );
    expect(iso(addMonthsClamped(new Date("2027-12-31T10:00:00Z"), 12))).toBe(
      "2028-12-31T10:00:00.000Z",
    );
  });
});
