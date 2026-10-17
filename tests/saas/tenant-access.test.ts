import { describe, expect, it } from "vitest";
import {
  getTenantAccessBlock,
  sumTenantUsageStudents,
  usageFromTenantRow,
} from "@/features/saas/tenant-access";

describe("getTenantAccessBlock", () => {
  it("allows active trial before end date", () => {
    const result = getTenantAccessBlock(
      {
        status: "trial",
        subscription_status: "trialing",
        trial_ends_at: "2099-01-01T00:00:00.000Z",
      },
      new Date("2026-01-01"),
    );
    expect(result.blocked).toBe(false);
  });

  it("blocks expired trial", () => {
    const result = getTenantAccessBlock(
      {
        status: "trial",
        subscription_status: "trialing",
        trial_ends_at: "2025-01-01T00:00:00.000Z",
      },
      new Date("2026-01-01"),
    );
    expect(result).toEqual({ blocked: true, reason: "trial_expired" });
  });

  it("blocks suspended tenants", () => {
    expect(getTenantAccessBlock({ status: "suspended" })).toEqual({
      blocked: true,
      reason: "suspended",
    });
  });

  it("blocks cancelled subscription lifecycle", () => {
    expect(getTenantAccessBlock({ status: "active", subscription_status: "canceled" })).toEqual({
      blocked: true,
      reason: "cancelled",
    });
  });
});

describe("tenant usage aggregation", () => {
  it("sums active students across tenant_usage rows", () => {
    expect(
      sumTenantUsageStudents([
        { active_students_count: 120 },
        { active_students_count: 80 },
        { active_students_count: null },
      ]),
    ).toBe(200);
  });

  it("reads usage from nested tenant row", () => {
    expect(usageFromTenantRow([{ active_students_count: 42 }])).toBe(42);
    expect(usageFromTenantRow({ active_students_count: 7 })).toBe(7);
  });
});
