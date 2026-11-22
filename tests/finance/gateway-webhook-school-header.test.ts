import { beforeEach, describe, expect, it, vi } from "vitest";
import { signGatewayWebhook } from "@/features/finance/gateway-webhook-signature";

/**
 * Análise 22, P2-3: com `X-SIGA-School-Id`, o SIGA verifica só as keys dessa escola e o
 * fornecedor deixa de partilhar com todas as escolas o limite apertado por IP.
 */
const SCHOOL_A = "11111111-1111-4111-8111-111111111111";
const SCHOOL_B = "22222222-2222-4222-8222-222222222222";
const KEY_A = "a".repeat(32);
const KEY_B = "b".repeat(32);

const state = vi.hoisted(() => ({
  integrationFilters: [] as Array<[string, unknown]>,
  limits: [] as Array<{ keys: string[]; max: number }>,
}));

function integrationsQuery() {
  const filters: Array<[string, unknown]> = [];
  const q: Record<string, unknown> = {};
  q["select"] = () => q;
  q["in"] = () => q;
  q["eq"] = (column: string, value: unknown) => {
    filters.push([column, value]);
    state.integrationFilters.push([column, value]);
    return q;
  };
  q["then"] = (resolve: (v: unknown) => unknown) => {
    const rows = [
      {
        school_id: SCHOOL_A,
        provider: "multicaixa_express",
        status: "connected",
        config: { webhookApiKey: KEY_A },
      },
      {
        school_id: SCHOOL_B,
        provider: "multicaixa_express",
        status: "connected",
        config: { webhookApiKey: KEY_B },
      },
    ].filter((row) =>
      filters.every(([column, value]) => (row as Record<string, unknown>)[column] === value),
    );
    return resolve({ data: rows, error: null });
  };
  return q;
}

function emptyQuery() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  q["maybeSingle"] = async () => ({ data: null, error: null });
  q["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return q;
}

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({
    from: (table: string) => (table === "school_integrations" ? integrationsQuery() : emptyQuery()),
  }),
}));
vi.mock("@/lib/shared-rate-limit", () => ({
  consumeRateLimit: async (keys: string[], options: { max: number }) => {
    state.limits.push({ keys, max: options.max });
    return true;
  },
}));
vi.mock("@/features/finance/gateway-webhook-telemetry", () => ({
  recordGatewayWebhookEvent: async () => undefined,
}));

const { runFinanceGatewayWebhook } = await import("@/features/finance/gateway-webhook-handler");

async function send(key: string, schoolId: string | null) {
  const rawBody = JSON.stringify({
    reference: "123456789",
    amount: 100,
    externalId: "emis-123456",
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signGatewayWebhook(key, timestamp, rawBody);
  return runFinanceGatewayWebhook({ rawBody, timestamp, signature, schoolId }, "1.2.3.4");
}

describe("webhook EMIS/Unitel com X-SIGA-School-Id", () => {
  beforeEach(() => {
    state.integrationFilters = [];
    state.limits = [];
  });

  it("procura só as keys da escola indicada e usa os limites largos", async () => {
    const result = await send(KEY_A, SCHOOL_A);
    // A assinatura confere; não há plano pendente, por isso pára antes de liquidar.
    expect(result.status).toBe(404);
    expect(state.integrationFilters).toContainEqual(["school_id", SCHOOL_A]);
    expect(state.limits).toEqual([
      { keys: ["ip:1.2.3.4:keyed"], max: 600 },
      { keys: [`gateway_school:${SCHOOL_A}`], max: 300 },
    ]);
  });

  it("a key de outra escola não serve, mesmo válida", async () => {
    const result = await send(KEY_A, SCHOOL_B);
    expect(result.status).toBe(401);
    // Assinatura falhada não gasta o limite da escola alvo.
    expect(state.limits.map((entry) => entry.keys[0])).toEqual(["ip:1.2.3.4:keyed"]);
  });

  it("sem o cabeçalho mantém a procura antiga e o limite apertado", async () => {
    const result = await send(KEY_B, null);
    expect(result.status).toBe(404);
    expect(state.integrationFilters).toEqual([]);
    expect(state.limits[0]).toEqual({ keys: ["ip:1.2.3.4"], max: 30 });
  });

  it("recusa um identificador que não é UUID, antes de qualquer leitura", async () => {
    const result = await send(KEY_A, "escola-a");
    expect(result.status).toBe(400);
    expect(state.limits).toEqual([]);
  });
});
