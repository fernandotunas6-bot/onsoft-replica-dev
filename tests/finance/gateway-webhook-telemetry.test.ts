import type { SupabaseClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { recordGatewayWebhookEvent } from "@/features/finance/gateway-webhook-telemetry";

function mockDb(insertResult: { error: { code?: string; message?: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  return {
    db: { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient,
    insert,
  };
}

describe("recordGatewayWebhookEvent", () => {
  it("mascara referência antes de persistir", async () => {
    const { db, insert } = mockDb({ error: null });

    await recordGatewayWebhookEvent(
      db,
      {
        channel: "multicaixa_express",
        reference: "123456789",
        amount: 45000,
        invoiceId: "inv-1",
        externalId: null,
        schoolId: "school-1",
        provider: "multicaixa_express",
        devMode: false,
      },
      { ok: true, status: 200, message: "Pagamento registado." },
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "*****6789",
        ok: true,
        http_status: 200,
      }),
    );
  });

  it("não propaga erro quando tabela ainda não existe", async () => {
    const { db } = mockDb({ error: { code: "42P01", message: "relation does not exist" } });

    await expect(
      recordGatewayWebhookEvent(
        db,
        {
          channel: "unitel_money",
          reference: "987654321",
          amount: 1000,
          invoiceId: null,
          externalId: null,
          schoolId: "school-1",
          provider: "unitel_money",
          devMode: false,
        },
        { ok: false, status: 401, message: "API key inválida." },
      ),
    ).resolves.toBeUndefined();
  });

  it("não chama Slack quando URL não configurada", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { db } = mockDb({ error: null });
    delete process.env.SIGA_GATEWAY_ALERT_SLACK_URL;

    await recordGatewayWebhookEvent(
      db,
      {
        channel: "multicaixa_express",
        reference: "111222333",
        amount: 5000,
        invoiceId: "inv-2",
        externalId: null,
        schoolId: "school-2",
        provider: "multicaixa_express",
        devMode: false,
      },
      { ok: false, status: 404, message: "Fatura não encontrada." },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("gateway-events-recent.mjs", () => {
  it("exige credenciais Supabase", () => {
    const script = path.join(process.cwd(), "scripts/siga/gateway-events-recent.mjs");
    const result = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        SIGA_IGNORE_DOTENV: "1",
        SUPABASE_URL: "",
        VITE_SUPABASE_URL: "",
        SUPABASE_SECRET_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SUPABASE_URL");
  }, 20000);
});

describe("gateway-failure-rate-check.mjs", () => {
  it("sai 0 quando alertas não estão configurados", () => {
    const script = path.join(process.cwd(), "scripts/siga/gateway-failure-rate-check.mjs");
    const result = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        SIGA_IGNORE_DOTENV: "1",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "test-secret",
        SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL: "",
        SIGA_GATEWAY_ALERT_SLACK_URL: "",
        RESEND_API_KEY: "",
        SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_TO: "",
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("omitido");
  }, 20000);
});
