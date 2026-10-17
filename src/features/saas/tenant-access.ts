import type { SubscriptionLifecycle, TenantStatus } from "@/features/saas/types";

export type TenantAccessBlockReason = "suspended" | "trial_expired" | "cancelled";

export interface TenantAccessSnapshot {
  status?: TenantStatus;
  subscription_status?: SubscriptionLifecycle;
  trial_ends_at?: string | null;
}

export function getTenantAccessBlock(
  tenant: TenantAccessSnapshot | null | undefined,
  now: Date = new Date(),
): { blocked: boolean; reason?: TenantAccessBlockReason } {
  if (!tenant) return { blocked: false };

  const blockedStatuses: TenantStatus[] = [
    "suspended",
    "past_due",
    "cancelled",
    "archived",
    "provisioning_failed",
  ];
  if (tenant.status && blockedStatuses.includes(tenant.status)) {
    return {
      blocked: true,
      reason: tenant.status === "cancelled" ? "cancelled" : "suspended",
    };
  }

  if (tenant.subscription_status === "canceled" || tenant.subscription_status === "unpaid") {
    return { blocked: true, reason: "cancelled" };
  }

  const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const trialExpired = trialEnds && !Number.isNaN(trialEnds.getTime()) && trialEnds < now;

  if (trialExpired && (tenant.status === "trial" || tenant.subscription_status === "trialing")) {
    return { blocked: true, reason: "trial_expired" };
  }

  return { blocked: false };
}

export function sumTenantUsageStudents(
  rows: Array<{ active_students_count?: number | null }> | null | undefined,
): number {
  return (rows ?? []).reduce((sum, row) => sum + (row.active_students_count ?? 0), 0);
}

export function usageFromTenantRow(
  usage:
    | { active_students_count?: number | null }
    | Array<{ active_students_count?: number | null }>
    | null
    | undefined,
): number {
  if (Array.isArray(usage)) return usage[0]?.active_students_count ?? 0;
  return usage?.active_students_count ?? 0;
}
