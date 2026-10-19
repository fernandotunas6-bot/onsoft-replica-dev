import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_DETAILS, PLAN_MODULES, planDetail } from "@/features/saas/plan-details";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("descrição dos pacotes", () => {
  it("o site usa exactamente o mesmo texto e as mesmas regras de preço que o SIGA", () => {
    expect(read("painel/web/src/lib/plan-details.ts")).toBe(
      read("src/features/saas/plan-details.ts"),
    );
    for (const copy of [
      "painel/web/src/lib/billing-periods.ts",
      "painel/admin/src/lib/billing-periods.ts",
    ]) {
      expect(read(copy)).toBe(read("src/features/saas/billing-periods.ts"));
    }
  });

  it("cada plano tem frase, público e destaques", () => {
    for (const detail of Object.values(PLAN_DETAILS)) {
      expect(detail.pitch.length).toBeGreaterThan(20);
      expect(detail.idealFor.length).toBeGreaterThan(10);
      expect(detail.highlights.length).toBeGreaterThanOrEqual(2);
    }
    expect(PLAN_MODULES.every((m) => m.items.length > 0)).toBe(true);
    expect(planDetail("business")?.highlights.join(" ")).toContain("Domínio próprio");
    expect(planDetail("inexistente")).toBeNull();
  });
});
