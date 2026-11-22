import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Porte da #210 (22/11/2026): o ADMIN passa a editar os descontos por periodicidade
 * da plataforma (`saas_billing_settings.periods`), que o cálculo da cobrança já lia.
 */
const state = vi.hoisted(() => ({
  row: null as { periods?: unknown } | null,
  upserts: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  admin: true,
}));

vi.mock("@/features/saas/platform-guard", () => ({
  requirePlatformAdminFromRequest: async () => {
    if (!state.admin) throw new Error("Sem permissão de administrador da plataforma.");
    return "admin-1";
  },
}));

function table(name: string) {
  const q: Record<string, unknown> = {};
  q["select"] = () => q;
  q["eq"] = () => q;
  q["maybeSingle"] = async () => ({
    data: name === "saas_billing_settings" ? state.row : null,
    error: null,
  });
  q["upsert"] = async (values: Record<string, unknown>) => {
    state.upserts.push(values);
    state.row = { periods: values["periods"] };
    return { error: null };
  };
  q["insert"] = async (values: Record<string, unknown>) => {
    state.audits.push(values);
    return { error: null };
  };
  return q;
}
vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({ from: (name: string) => table(name) }),
}));

const { Route } = await import("@/routes/api/saas/billing-settings");
type Handler = (ctx: { request: Request }) => Promise<Response>;
const handlers = (Route.options as unknown as { server: { handlers: Record<string, Handler> } })
  .server.handlers;
const call = (method: "GET" | "POST", body?: unknown) =>
  handlers[method]!({
    request: new Request("https://portal-siga.com/api/saas/billing-settings", {
      method,
      headers: { Authorization: "Bearer t", Origin: "https://siga-admin.pages.dev" },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    }),
  });

describe("descontos por periodicidade (ADMIN)", () => {
  beforeEach(() => {
    state.row = null;
    state.upserts = [];
    state.audits = [];
    state.admin = true;
  });

  it("sem nada gravado, devolve a omissão do catálogo, sem cache", async () => {
    const response = await call("GET");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { discounts: Record<string, number> };
    expect(body.discounts).toEqual({ quarterly: 5, semiannual: 10, yearly: 16.67 });
  });

  it("quem não é administrador da plataforma é recusado antes de o corpo ser lido", async () => {
    state.admin = false;
    const response = await call("POST", "{não é json");
    expect(response.status).toBe(401);
    expect(state.upserts).toEqual([]);
  });

  it("recusa descontos fora de 0–60 %", async () => {
    for (const yearly of [-1, 61, Number.NaN]) {
      const response = await call("POST", { discounts: { quarterly: 5, semiannual: 10, yearly } });
      expect(response.status, String(yearly)).toBe(400);
    }
    expect(state.upserts).toEqual([]);
  });

  it("grava no formato que o cálculo lê, preserva o resto e regista na auditoria", async () => {
    state.row = {
      periods: [
        { code: "yearly", discount_pct: 16.67, label: "Anual" },
        { code: "monthly", discount_pct: 0, enabled: true },
      ],
    };
    const response = await call("POST", {
      discounts: { quarterly: 4, semiannual: 9.555, yearly: 20 },
    });
    expect(response.status).toBe(200);
    const periods = state.upserts[0]!["periods"] as Array<Record<string, unknown>>;
    expect(periods).toEqual(
      expect.arrayContaining([
        { code: "monthly", discount_pct: 0, enabled: true },
        { code: "yearly", discount_pct: 20, label: "Anual" },
        { code: "quarterly", discount_pct: 4 },
        { code: "semiannual", discount_pct: 9.56 },
      ]),
    );
    expect(state.upserts[0]).toMatchObject({ id: 1, updated_by: "admin-1" });
    expect(state.audits[0]).toMatchObject({ action: "billing_period_discounts_updated" });
    const body = (await response.json()) as { discounts: Record<string, number> };
    expect(body.discounts).toEqual({ quarterly: 4, semiannual: 9.56, yearly: 20 });
  });
});
