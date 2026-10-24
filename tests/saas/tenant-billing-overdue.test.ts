import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { suspendOverdueTenants } from "@/features/saas/tenant-billing";

type Row = Record<string, unknown>;

/** Base em memória com o pouco de PostgREST que a tarefa usa. */
function fakeDb(tables: Record<string, Row[]>) {
  const db = {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let patch: Row | null = null;
      let window: [number, number] | null = null;
      const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        range: (from: number, to: number) => {
          window = [from, to];
          return chain;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        update: (values: Row) => {
          patch = values;
          return chain;
        },
        insert: async (values: Row) => {
          (tables[table] ??= []).push(values);
          return { error: null };
        },
        then: (resolve: (result: unknown) => void) => {
          if (patch) {
            const changed = rows();
            for (const r of changed) Object.assign(r, patch);
            return resolve({ data: changed.map((r) => ({ id: r["id"] })), error: null });
          }
          const all = rows();
          return resolve({
            data: window ? all.slice(window[0], window[1] + 1) : all,
            error: null,
          });
        },
      };
      return chain;
    },
  };
  return db as unknown as SupabaseClient;
}

const NOW = new Date("2026-10-20T10:00:00Z");

function setup(overrides: { profile?: Row; tenant?: Row; subscription?: Row } = {}) {
  const tables: Record<string, Row[]> = {
    tenant_billing_profiles: [
      {
        tenant_id: "t1",
        institution_type: "private",
        auto_suspend: true,
        grace_days: 7,
        billing_paused: false,
        ...overrides.profile,
      },
    ],
    tenants: [{ id: "t1", status: "active", subscription_status: "active", ...overrides.tenant }],
    subscriptions: [
      {
        id: "s1",
        tenant_id: "t1",
        status: "active",
        current_period_end: "2026-10-10T12:00:00Z",
        ...overrides.subscription,
      },
    ],
    saas_audit_logs: [],
  };
  return { db: fakeDb(tables), tables };
}

describe("suspendOverdueTenants", () => {
  it("um erro de leitura falha a tarefa (não passa por «nada a fazer»)", async () => {
    const db = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "range"]) chain[m] = () => chain;
        chain["then"] = (resolve: (r: unknown) => void) =>
          resolve({ data: null, error: { message: "timeout" } });
        return chain;
      },
    } as unknown as SupabaseClient;
    await expect(suspendOverdueTenants(db, NOW)).rejects.toThrow(/timeout/);
  });

  it("passa a past_due a escola cobrada com o período pago vencido há mais que a tolerância", async () => {
    const { db, tables } = setup();
    expect(await suspendOverdueTenants(db, NOW)).toBe(1);
    expect(tables.tenants![0]).toMatchObject({
      status: "past_due",
      subscription_status: "past_due",
    });
    expect(tables.subscriptions![0]).toMatchObject({ status: "past_due" });
    expect(tables.saas_audit_logs![0]).toMatchObject({
      tenant_id: "t1",
      action: "TENANT_BILLING_OVERDUE",
    });
  });

  it("dentro da tolerância não mexe", async () => {
    const { db, tables } = setup({ subscription: { current_period_end: "2026-10-15T12:00:00Z" } });
    expect(await suspendOverdueTenants(db, NOW)).toBe(0);
    expect(tables.tenants![0]!.status).toBe("active");
  });

  it("com as cobranças pausadas não mexe", async () => {
    const { db, tables } = setup({
      profile: { billing_paused: true, billing_paused_reason: "Acordo com a direcção" },
    });
    expect(await suspendOverdueTenants(db, NOW)).toBe(0);
    expect(tables.tenants![0]!.status).toBe("active");
    expect(tables.saas_audit_logs).toHaveLength(0);
  });

  it("escola reactivada à mão (assinatura ainda em atraso) não volta a ser suspensa", async () => {
    const { db, tables } = setup({
      tenant: { subscription_status: "past_due" },
      subscription: { status: "past_due" },
    });
    expect(await suspendOverdueTenants(db, NOW)).toBe(0);
    expect(tables.tenants![0]!.status).toBe("active");
  });
});
