import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auditoria 13, A1: uma escola suspensa, cancelada, arquivada ou com o trial
 * terminado não grava. Antes o bloqueio existia só no ecrã (`TenantProvider`).
 */
type Row = Record<string, unknown> | null;
let school: Row = null;
let tenant: Row = null;
let schoolError: unknown = null;
let tenantError: unknown = null;

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () =>
          table === "schools"
            ? { data: school, error: schoolError }
            : { data: tenant, error: tenantError },
      };
      return chain;
    },
  },
}));

import { assertTenantAllowsWrites } from "@/integrations/supabase/sga-admin";

const NOW = new Date("2026-10-06T12:00:00Z");

describe("escritas de uma escola bloqueada", () => {
  beforeEach(() => {
    school = { status: "active", tenant_id: "t1" };
    tenant = { status: "active", subscription_status: "active", trial_ends_at: null };
    schoolError = null;
    tenantError = null;
  });

  it("escola activa com assinatura em dia grava", async () => {
    await expect(assertTenantAllowsWrites("s1", NOW)).resolves.toBeUndefined();
  });

  it("trial em curso grava; trial terminado não", async () => {
    tenant = { status: "active", subscription_status: "trialing", trial_ends_at: "2026-10-08" };
    await expect(assertTenantAllowsWrites("s1", NOW)).resolves.toBeUndefined();
    tenant = { status: "active", subscription_status: "trialing", trial_ends_at: "2026-10-02" };
    await expect(assertTenantAllowsWrites("s1", NOW)).rejects.toThrow(
      /período experimental terminou/,
    );
  });

  it("suspensa, em atraso, arquivada ou com falha de criação não grava", async () => {
    for (const status of ["suspended", "past_due", "archived", "provisioning_failed"]) {
      tenant = { status, subscription_status: "active", trial_ends_at: null };
      await expect(assertTenantAllowsWrites("s1", NOW)).rejects.toThrow(/suspensa/);
    }
  });

  it("cancelada (tenant ou subscrição) não grava", async () => {
    tenant = { status: "cancelled", subscription_status: "active", trial_ends_at: null };
    await expect(assertTenantAllowsWrites("s1", NOW)).rejects.toThrow(/cancelada/);
    tenant = { status: "active", subscription_status: "unpaid", trial_ends_at: null };
    await expect(assertTenantAllowsWrites("s1", NOW)).rejects.toThrow(/cancelada/);
  });

  it("escola arquivada não grava, seja qual for o tenant", async () => {
    school = { status: "archived", tenant_id: "t1" };
    await expect(assertTenantAllowsWrites("s1", NOW)).rejects.toThrow(/arquivada/);
  });

  it("escola sem tenant (antiga) grava", async () => {
    school = { status: "active", tenant_id: null };
    await expect(assertTenantAllowsWrites("s1", NOW)).resolves.toBeUndefined();
  });

  it("sem confirmar o estado, falha fechado", async () => {
    schoolError = { message: "timeout" };
    await expect(assertTenantAllowsWrites("s1", NOW)).rejects.toThrow(/confirmar o estado/);
    schoolError = null;
    tenantError = { message: "timeout" };
    await expect(assertTenantAllowsWrites("s1", NOW)).rejects.toThrow(/confirmar o estado/);
  });

  it("o guarda de escrita chama-o; o de leitura não", () => {
    const source = readFileSync("src/integrations/supabase/sga-admin.ts", "utf8");
    const fn = source.slice(source.indexOf("async function requireSgaWriterWithMode"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    // Caminho da permissão por módulo: directo. Caminho do cargo: através de
    // assertModuleNotBlocked, que o RH também usa sozinho.
    expect(body.match(/if \(mode === "write"\) await assertTenantAllowsWrites/g)).toHaveLength(1);
    expect(body).toMatch(
      /await assertModuleNotBlocked\(membership\.schoolId, userId, moduleKey, mode\)/,
    );
    const guard = source.slice(source.indexOf("export async function assertModuleNotBlocked"));
    expect(guard.slice(0, guard.indexOf("\n}\n"))).toMatch(
      /if \(mode === "write"\) await assertTenantAllowsWrites\(schoolId\)/,
    );
  });

  it("o RH grava pelo guarda de módulo em modo escrita", () => {
    for (const file of ["payroll", "payments", "absences", "salary-changes", "salary-amendments"]) {
      const source = readFileSync(`src/features/hr/${file}.ts`, "utf8");
      expect(source).toMatch(/assertModuleNotBlocked\([^)]*"financeiro",\s*(mode|"write")\)/);
    }
  });
});
