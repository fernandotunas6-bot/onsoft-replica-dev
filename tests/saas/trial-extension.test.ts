import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trialExtensionError } from "@/features/saas/tenant-billing-rules";

describe("prolongar o trial no ADMIN", () => {
  it("uma assinatura paga não se prolonga como trial", () => {
    expect(trialExtensionError({ status: "trial", subscription_status: "trialing" })).toBeNull();
    expect(trialExtensionError({ status: "active", subscription_status: "active" })).toMatch(
      /já paga/,
    );
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
    const { addMonthsClamped } = await import("@/features/saas/tenant-billing-rules");
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
