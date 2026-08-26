import { describe, expect, it } from "vitest";
import { buildFinanceOverviewSuggestionRules } from "@/features/intelligence/finance/finance-overview-suggestion-rules";
import type { AppContext } from "@/features/intelligence/types";
import type { FinanceOverviewSnapshot } from "@/features/intelligence/finance/finance-overview-adapter";

const context: AppContext = {
  userId: "user-1",
  role: "Administrador",
  grants: {},
  pathname: "/faturas",
  focusedEntity: {
    type: "finance-overview",
    id: "overview",
    label: "Faturas",
    schoolId: "escola-1",
    data: {},
  },
};

const healthySnapshot: FinanceOverviewSnapshot = {
  totalCount: 5,
  paidCount: 5,
  pendingCount: 0,
  overdueCount: 0,
  overdueTotal: 0,
};

describe("buildFinanceOverviewSuggestionRules", () => {
  const rules = buildFinanceOverviewSuggestionRules();
  const byId = Object.fromEntries(rules.map((rule) => [rule.id, rule]));

  it("always includes a low-priority baseline suggestion", () => {
    expect(byId["emitir-relatorio"]?.evaluate(healthySnapshot, context)).not.toBeNull();
  });

  it("flags overdue invoices with the top priority", () => {
    const snapshot = { ...healthySnapshot, overdueCount: 3, overdueTotal: 45000 };
    const suggestion = byId["faturas-vencidas"]?.evaluate(snapshot, context);
    expect(suggestion?.priority).toBe(95);
    expect(suggestion?.description).toContain("45");
  });

  it("does not flag overdue invoices when there are none", () => {
    expect(byId["faturas-vencidas"]?.evaluate(healthySnapshot, context)).toBeNull();
  });

  it("flags a large volume of pending invoices", () => {
    const snapshot = { ...healthySnapshot, pendingCount: 12 };
    expect(byId["muitas-pendentes"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("does not flag a small volume of pending invoices", () => {
    const snapshot = { ...healthySnapshot, pendingCount: 3 };
    expect(byId["muitas-pendentes"]?.evaluate(snapshot, context)).toBeNull();
  });
});
