import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * A resolução de tenant por slug e por hostname é alcançável **sem sessão**: a
 * página de login precisa de saber que escola é, antes de existir utilizador.
 *
 * Isso torna a lista de colunas uma fronteira de segurança. Enquanto era
 * `select("*")`, qualquer pessoa que soubesse o subdomínio de uma escola —
 * que é público — obtinha `contact_name`, `contact_phone` e `contact_email`,
 * dados pessoais do responsável da instituição.
 *
 * Estes testes fixam a projecção pública. Se alguém voltar a pôr `*`, falham.
 */

const selectSpy = vi.fn();

function buildQuery(row: Record<string, unknown> | null) {
  const query: Record<string, unknown> = {
    select: (columns: string) => {
      selectSpy(columns);
      return query;
    },
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return query;
}

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({
    from: (table: string) =>
      buildQuery(
        table === "tenant_domains"
          ? { tenant_id: "11111111-1111-1111-1111-111111111111" }
          : { id: "11111111-1111-1111-1111-111111111111", name: "Colégio Teste", slug: "teste" },
      ),
  }),
}));

const { fetchTenantBySlug, fetchTenantByHostname } = await import("@/features/saas/tenant-lookup");

const PERSONAL_COLUMNS = ["contact_name", "contact_phone", "contact_email"];

describe("projecção pública do tenant", () => {
  beforeEach(() => selectSpy.mockClear());

  it("não usa select(*) ao resolver por slug", async () => {
    await fetchTenantBySlug("teste");
    const columns = selectSpy.mock.calls.map((call) => String(call[0]));
    expect(columns.length).toBeGreaterThan(0);
    for (const selection of columns) {
      expect(selection.startsWith("*")).toBe(false);
    }
  });

  it("não expõe contactos pessoais ao resolver por slug", async () => {
    await fetchTenantBySlug("teste");
    const selection = selectSpy.mock.calls.map((call) => String(call[0])).join(" ");
    for (const column of PERSONAL_COLUMNS) {
      expect(selection).not.toContain(column);
    }
  });

  it("não expõe contactos pessoais ao resolver por hostname", async () => {
    await fetchTenantByHostname("teste.portal-siga.com");
    const selection = selectSpy.mock.calls.map((call) => String(call[0])).join(" ");
    for (const column of PERSONAL_COLUMNS) {
      expect(selection).not.toContain(column);
    }
  });

  it("continua a trazer o que a página de login precisa", async () => {
    await fetchTenantBySlug("teste");
    const selection = selectSpy.mock.calls.map((call) => String(call[0])).join(" ");
    for (const column of ["name", "slug", "status"]) {
      expect(selection).toContain(column);
    }
  });
});
