import { describe, expect, it } from "vitest";
import { buildDashboardSuggestionRules } from "@/features/intelligence/dashboard/dashboard-suggestion-rules";
import type { AppContext } from "@/features/intelligence/types";
import type { DashboardOverviewSnapshot } from "@/features/intelligence/dashboard/dashboard-suggestion-rules";

const context: AppContext = {
  userId: "user-1",
  role: "Administrador",
  grants: {},
  pathname: "/",
  focusedEntity: {
    type: "dashboard-overview",
    id: "global",
    label: "Dashboard",
    schoolId: "escola-1",
    data: {},
  },
};

const healthySnapshot: DashboardOverviewSnapshot = {
  academicYear: { name: "2026/2027" },
  overviewCounts: { students: 100, classes: 5 },
  pendingEnrollmentApplications: 0,
  unpaidInvoices: 0,
  upcomingEvents: 2,
};

describe("buildDashboardSuggestionRules", () => {
  const rules = buildDashboardSuggestionRules();
  const byId = Object.fromEntries(rules.map((rule) => [rule.id, rule]));

  it("always includes a low-priority baseline suggestion", () => {
    expect(byId["dashboard-relatorios"]?.evaluate(healthySnapshot, context)).not.toBeNull();
  });

  it("flags missing academic year with top priority", () => {
    const snapshot = { ...healthySnapshot, academicYear: null };
    const suggestion = byId["dashboard-ano-letivo"]?.evaluate(snapshot, context);
    expect(suggestion?.priority).toBe(100);
  });

  it("flags pending enrollment applications", () => {
    const snapshot = { ...healthySnapshot, pendingEnrollmentApplications: 4 };
    expect(byId["dashboard-candidaturas"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("does not flag candidates if there are none", () => {
    expect(byId["dashboard-candidaturas"]?.evaluate(healthySnapshot, context)).toBeNull();
  });

  it("flags an empty calendar", () => {
    const snapshot = { ...healthySnapshot, upcomingEvents: 0 };
    expect(byId["dashboard-calendario-vazio"]?.evaluate(snapshot, context)).not.toBeNull();
  });
});
