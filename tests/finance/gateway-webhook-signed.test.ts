import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkGatewayTimestamp,
  gatewaySignatureMatches,
  signGatewayWebhook,
} from "@/features/finance/gateway-webhook-signature";

const KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const SCHOOL = "11111111-1111-4111-8111-111111111111";
const PLAN_INVOICE = "22222222-2222-4222-8222-222222222222";
const OTHER_INVOICE = "33333333-3333-4333-8333-333333333333";

const state = {
  plans: [] as Array<Record<string, unknown>>,
};

function query(table: string) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = self;
  q["maybeSingle"] = async () => {
    if (table === "finance_invoices") {
      // Já paga: a liquidação devolve "já estava liquidada" sem escrever nada.
      return { data: { id: PLAN_INVOICE, status: "paid", amount: 100 }, error: null };
    }
    if (table === "finance_gateway_webhook_events") return { data: null, error: null };
    return { data: state.plans[0] ?? null, error: null };
  };
  q["then"] = (resolve: (v: unknown) => unknown) => {
    if (table === "school_integrations") {
      return resolve({
        data: [
          {
            school_id: SCHOOL,
            provider: "multicaixa_express",
            status: "connected",
            config: { webhookApiKey: KEY },
          },
        ],
        error: null,
      });
    }
    if (table === "finance_payment_plans") return resolve({ data: state.plans, error: null });
    return resolve({ data: [], error: null });
  };
  return q;
}

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({ from: (t: string) => query(t) }),
}));
vi.mock("@/lib/shared-rate-limit", () => ({ consumeRateLimit: async () => true }));
vi.mock("@/features/finance/gateway-webhook-telemetry", () => ({
  recordGatewayWebhookEvent: async () => undefined,
}));

const handler = await import("@/features/finance/gateway-webhook-handler");

async function send(body: Record<string, unknown>, opts: { key?: string; ts?: number } = {}) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const signature = await signGatewayWebhook(opts.key ?? KEY, timestamp, rawBody);
  return handler.runFinanceGatewayWebhook({ rawBody, timestamp, signature }, "1.2.3.4");
}

describe("assinatura do aviso EMIS/Unitel", () => {
  it("a assinatura confere só com a mesma key, carimbo e corpo", async () => {
    const sig = await signGatewayWebhook(KEY, "1790000000", '{"a":1}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(await gatewaySignatureMatches(KEY, "1790000000", '{"a":1}', sig)).toBe(true);
    expect(await gatewaySignatureMatches(KEY, "1790000000", '{"a":2}', sig)).toBe(false);
    expect(await gatewaySignatureMatches(KEY, "1790000001", '{"a":1}', sig)).toBe(false);
    expect(
      await gatewaySignatureMatches("outra-key-0000000000", "1790000000", '{"a":1}', sig),
    ).toBe(false);
  });

  it("recusa carimbos fora de 5 minutos", () => {
    const now = 1_790_000_000_000;
    expect(checkGatewayTimestamp("1790000000", now).ok).toBe(true);
    expect(checkGatewayTimestamp("1789999000", now).ok).toBe(false);
    expect(checkGatewayTimestamp(null, now).ok).toBe(false);
  });
});

describe("webhook EMIS/Unitel", () => {
  beforeEach(() => {
    state.plans = [
      {
        id: "plan-1",
        school_id: SCHOOL,
        invoice_id: PLAN_INVOICE,
        reference: "123456789",
        status: "pending_gateway",
        channel: "multicaixa_express",
      },
    ];
  });

  it("recusa a API key no corpo", async () => {
    const result = await handler.runFinanceGatewayWebhook(
      {
        rawBody: JSON.stringify({
          apiKey: KEY,
          reference: "123456789",
          amount: 1,
          externalId: "x-123456",
        }),
        timestamp: null,
        signature: null,
      },
      "1.2.3.4",
    );
    expect(result.status).toBe(400);
  });

  it("recusa pedido sem assinatura válida", async () => {
    const result = await send(
      { reference: "123456789", amount: 100, externalId: "emis-1" + "23456" },
      { key: "key-que-nao-e-da-escola-123" },
    );
    expect(result.status).toBe(401);
  });

  it("recusa pedido repetido fora da janela", async () => {
    const result = await send(
      { reference: "123456789", amount: 100, externalId: "emis-123456" },
      { ts: Math.floor(Date.now() / 1000) - 3600 },
    );
    expect(result.status).toBe(401);
  });

  it("sem plano pendente com a referência, não liquida nenhuma fatura", async () => {
    state.plans = [];
    const result = await send({
      reference: "999999999",
      amount: 100,
      externalId: "emis-123456",
      invoiceId: OTHER_INVOICE,
    });
    expect(result.status).toBe(404);
  });

  it("um invoiceId diferente do plano é recusado", async () => {
    const result = await send({
      reference: "123456789",
      amount: 100,
      externalId: "emis-123456",
      invoiceId: OTHER_INVOICE,
    });
    expect(result.status).toBe(409);
  });

  it("pedido assinado com a key da escola chega à fatura do plano", async () => {
    const result = await send({ reference: "123 456 789", amount: 100, externalId: "emis-123456" });
    expect(result).toMatchObject({ ok: true, status: 200 });
  });
});
