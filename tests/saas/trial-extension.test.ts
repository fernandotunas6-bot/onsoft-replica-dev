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
