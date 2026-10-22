import type { SubscriptionLifecycle, TenantStatus } from "@/features/saas/types";

export type TenantAccessBlockReason = "suspended" | "past_due" | "trial_expired" | "cancelled";

export interface TenantAccessSnapshot {
  status?: TenantStatus;
  subscription_status?: SubscriptionLifecycle;
  trial_ends_at?: string | null;
  /**
   * Cobranças pausadas ou escola pública isenta (mantido pelo servidor a partir de
   * `tenant_billing_profiles`). Sem cobrança, o trial e os atrasos não bloqueiam;
   * suspender, cancelar e arquivar continuam a ser decisões que bloqueiam.
   */
  billing_exempt?: boolean | null;
}

export function getTenantAccessBlock(
  tenant: TenantAccessSnapshot | null | undefined,
  now: Date = new Date(),
): { blocked: boolean; reason?: TenantAccessBlockReason } {
  if (!tenant) return { blocked: false };

  const exempt = tenant.billing_exempt === true;
  const blockedStatuses: TenantStatus[] = [
    "suspended",
    ...(exempt ? [] : (["past_due"] as TenantStatus[])),
    "cancelled",
    "archived",
    "provisioning_failed",
  ];
  if (tenant.status && blockedStatuses.includes(tenant.status)) {
    return {
      blocked: true,
      reason:
        tenant.status === "cancelled"
          ? "cancelled"
          : tenant.status === "past_due"
            ? "past_due"
            : "suspended",
    };
  }

  if (exempt) return { blocked: false };

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

/**
 * Bloqueio do **website público** da escola, que não é o mesmo do portal.
 *
 * `getTenantAccessBlock` serve o portal: trial expirado ou mensalidade em
 * atraso fecham a operação — notas, propinas, matrículas — e é a alavanca de
 * cobrança. Aplicá-lo ao website institucional punia quem não é cliente: a
 * 2026-10-21 as três escolas reais da produção respondiam «Esta página não
 * está disponível» a quem procurasse a instituição, porque o período
 * experimental tinha acabado em Setembro e Outubro. O candidato não é a parte
 * em falta na relação comercial.
 *
 * Fica de pé, portanto, enquanto a escola existir como instituição. Só as
 * decisões sobre a própria instituição a tiram do ar: suspensa, cancelada,
 * arquivada ou com o provisionamento falhado.
 */
export function getPublicSiteBlock(
  tenant: TenantAccessSnapshot | null | undefined,
): { blocked: boolean; reason?: TenantAccessBlockReason } {
  if (!tenant?.status) return { blocked: false };
  if (tenant.status === "cancelled") return { blocked: true, reason: "cancelled" };
  if (["suspended", "archived", "provisioning_failed"].includes(tenant.status))
    return { blocked: true, reason: "suspended" };
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
