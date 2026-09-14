import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * O caminho de resolução que existe para quando o hostname não chega.
 *
 * O desenho é resolver a escola pelo subdomínio, através do wildcard
 * `*.PLATFORM_DOMAIN`. Enquanto esse registo DNS não existir, nenhum subdomínio
 * de escola resolve e o único host alcançável é `app.PLATFORM_DOMAIN` — que é
 * reservado e não corresponde a nenhuma entrada em `tenant_domains`. Sem esta
 * resolução, quem tem escola atribuída entra e não vê instituição nenhuma.
 */

const selectSpy = vi.fn();
const rows: Record<string, unknown> = {};

function query(table: string) {
  const q: Record<string, unknown> = {
    select: (cols: string) => {
      selectSpy(table, cols);
      return q;
    },
    eq: () => q,
    maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
  };
  return q;
}

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({ from: (table: string) => query(table) }),
}));

const { fetchTenantBySchoolId } = await import("@/features/saas/tenant-lookup");

const SCHOOL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TENANT = "11111111-2222-3333-4444-555555555555";

describe("fetchTenantBySchoolId", () => {
  beforeEach(() => {
    selectSpy.mockClear();
    for (const k of Object.keys(rows)) delete rows[k];
  });

  it("resolve o tenant a partir da escola", async () => {
    rows["schools"] = { tenant_id: TENANT };
    rows["tenants"] = { id: TENANT, name: "Colégio Teste", slug: "teste", status: "active" };

    const tenant = await fetchTenantBySchoolId(SCHOOL);
    expect(tenant?.id).toBe(TENANT);
    expect(tenant?.name).toBe("Colégio Teste");
  });

  it("devolve null quando a escola não existe", async () => {
    expect(await fetchTenantBySchoolId(SCHOOL)).toBeNull();
  });

  it("devolve null quando a escola não tem tenant", async () => {
    rows["schools"] = { tenant_id: null };
    expect(await fetchTenantBySchoolId(SCHOOL)).toBeNull();
  });

  it("devolve null sem consultar a base quando o id vem vazio", async () => {
    expect(await fetchTenantBySchoolId("")).toBeNull();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("não expõe os contactos da instituição", async () => {
    // Mesma projecção pública das outras resoluções: o resultado chega ao
    // browser, e `contact_email` e afins são dados pessoais do responsável.
    rows["schools"] = { tenant_id: TENANT };
    rows["tenants"] = { id: TENANT, name: "Colégio Teste", slug: "teste" };

    await fetchTenantBySchoolId(SCHOOL);
    const tenantSelect = selectSpy.mock.calls.find((c) => c[0] === "tenants")?.[1] as string;
    expect(tenantSelect).toBeTruthy();
    expect(tenantSelect.startsWith("*")).toBe(false);
    for (const col of ["contact_name", "contact_phone", "contact_email"]) {
      expect(tenantSelect).not.toContain(col);
    }
  });
});
