import { describe, expect, it } from "vitest";
import {
  describeSubscription,
  formatBytes,
  pendingPlanRequestFrom,
  usageShare,
} from "@/features/saas/subscription-view";

describe("pedido de mudança de plano", () => {
  const req = {
    action: "plan_change_requested",
    metadata: { to: "business" },
    created_at: "2026-09-28",
  };
  it("fica pendente até ser tratado", () => {
    expect(pendingPlanRequestFrom([req])).toEqual({
      planCode: "business",
      requestedAt: "2026-09-28",
    });
  });
  it("fecha com o cancelamento ou com a mudança de plano no ADMIN", () => {
    expect(
      pendingPlanRequestFrom([
        { action: "plan_change_cancelled", metadata: {}, created_at: "x" },
        req,
      ]),
    ).toBeNull();
    expect(
      pendingPlanRequestFrom([
        {
          action: "TENANT_SUBSCRIPTION_UPDATED",
          metadata: { plan_code: "business" },
          created_at: "x",
        },
        req,
      ]),
    ).toBeNull();
  });
  it("prolongar o período experimental não fecha o pedido", () => {
    expect(
      pendingPlanRequestFrom([
        {
          action: "TENANT_SUBSCRIPTION_UPDATED",
          metadata: { extend_trial_days: 7 },
          created_at: "x",
        },
        req,
      ]),
    ).toEqual({ planCode: "business", requestedAt: "2026-09-28" });
  });
});

const now = new Date("2026-09-28T10:00:00Z");
const base = {
  status: "trial",
  subscriptionStatus: "trialing",
  trialEndsAt: null,
  periodEnd: null,
};

describe("estado da assinatura para o Administrador", () => {
  it("conta os dias do período experimental", () => {
    const s = describeSubscription({ ...base, trialEndsAt: "2026-10-08T10:00:00Z" }, now);
    expect(s.label).toBe("Período experimental");
    expect(s.detail).toMatch(/^Faltam 10 dias/);
    expect(s.tone).toBe("info");
    expect(s.trialProgress).toBeCloseTo(4 / 14);
  });

  it("avisa quando faltam poucos dias ou o período acabou", () => {
    expect(describeSubscription({ ...base, trialEndsAt: "2026-09-30T10:00:00Z" }, now).tone).toBe(
      "warning",
    );
    expect(describeSubscription({ ...base, trialEndsAt: "2026-09-20T10:00:00Z" }, now).label).toBe(
      "Período experimental terminou",
    );
  });

  it("distingue activa, em atraso, suspensa e cancelada", () => {
    const active = describeSubscription(
      {
        status: "active",
        subscriptionStatus: "active",
        trialEndsAt: null,
        periodEnd: "2026-12-31T00:00:00Z",
      },
      now,
    );
    expect(active.label).toBe("Activa");
    expect(active.detail).toMatch(/Período pago até/);
    expect(
      describeSubscription({ ...base, status: "active", subscriptionStatus: "past_due" }, now)
        .label,
    ).toBe("Pagamento em atraso");
    expect(describeSubscription({ ...base, status: "suspended" }, now).tone).toBe("danger");
    expect(
      describeSubscription({ ...base, status: "cancelled", subscriptionStatus: "canceled" }, now)
        .label,
    ).toBe("Cancelada");
  });

  it("mede o uso face ao limite e formata o armazenamento", () => {
    expect(usageShare(450, 500)).toBeCloseTo(0.9);
    expect(usageShare(10, null)).toBeNull();
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(3.5 * 1024 ** 3)).toBe("3,5 GB");
  });
});
