import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Corpo dos pedidos com limite de bytes em todas as rotas de `src/routes/api/`.
 *
 * Um Worker tem 128 MB de memória e a Cloudflare aceita corpos até 100 MB. Até
 * 11/11/2026, 31 rotas faziam `request.json()` ou `request.text()` sem limite, e quase
 * todas antes de qualquer verificação: as catracas antes da chave do dispositivo, os
 * webhooks de pagamento antes da assinatura, o registo público sem sessão nenhuma. Um
 * só pedido grande ocupava a memória do isolado que também servia as escolas.
 */

const mocks = vi.hoisted(() => ({
  runDeviceGatePassWebhook: vi.fn(),
  runFinanceGatewayWebhook: vi.fn(),
  requestSignupEmailCode: vi.fn(),
  requirePlatformAdminFromRequest: vi.fn(),
}));
vi.mock("@/features/catracas/device-webhook-handler", () => ({
  runDeviceGatePassWebhook: mocks.runDeviceGatePassWebhook,
}));
vi.mock("@/features/finance/gateway-webhook-handler", () => ({
  runFinanceGatewayWebhook: mocks.runFinanceGatewayWebhook,
}));
vi.mock("@/features/saas/signup-email-api", () => ({
  requestSignupEmailCode: mocks.requestSignupEmailCode,
}));
vi.mock("@/features/saas/platform-guard", () => ({
  requirePlatformAdminFromRequest: mocks.requirePlatformAdminFromRequest,
}));

const ROOT = resolve(process.cwd());
const API_DIR = join(ROOT, "src/routes/api");
const RAW_BODY_READ = /\b(?:request|req)\.(?:json|text|formData|arrayBuffer|blob)\(\)/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

type Handler = (ctx: { request: Request }) => Promise<Response>;

async function postTo(modulePath: string, request: Request): Promise<Response> {
  const { Route } = (await import(/* @vite-ignore */ modulePath)) as {
    Route: { options: unknown };
  };
  const handlers = (Route.options as { server: { handlers: { POST: Handler } } }).server.handlers;
  return handlers.POST({ request });
}

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(`https://escola.portal-siga.com${path}`, { method: "POST", body, headers });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("leitura do corpo com limite", () => {
  it("nenhuma rota da API nem o auxiliar da consola lê o corpo sem limite", () => {
    const sources = [
      ...filesUnder(API_DIR).filter((path) => /\.tsx?$/.test(path)),
      join(ROOT, "src/features/saas/site-admin-route.ts"),
      join(ROOT, "src/server.ts"),
    ];
    const offenders = sources
      .filter((path) => RAW_BODY_READ.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path));
    expect(offenders).toEqual([]);
  });

  it("catracas: corpo grande recusado com 413 antes de procurar a chave do dispositivo", async () => {
    const response = await postTo(
      "@/routes/api/catracas/device-scan",
      post("/api/catracas/device-scan", JSON.stringify({ apiKey: "k".repeat(20_000) })),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ granted: false, reason: "Pedido demasiado grande." });
    expect(mocks.runDeviceGatePassWebhook).not.toHaveBeenCalled();
  });

  it("webhook de pagamento: recusa acima de 1 MB e entrega os bytes exactos abaixo disso", async () => {
    const big = await postTo(
      "@/routes/api/finance/gateway.confirm",
      post("/api/finance/gateway/confirm", "x".repeat(1024 * 1024 + 1)),
    );
    expect(big.status).toBe(413);
    expect(mocks.runFinanceGatewayWebhook).not.toHaveBeenCalled();

    mocks.runFinanceGatewayWebhook.mockResolvedValue({ ok: true, status: 200, message: "ok" });
    const raw = '{"reference":"Fatura nº 12 — São Tomé","amount":15000.5}';
    const ok = await postTo("@/routes/api/finance/gateway.confirm", post("/x", raw));
    expect(ok.status).toBe(200);
    // A assinatura cobre o texto recebido: nem uma vírgula pode mudar.
    expect(mocks.runFinanceGatewayWebhook.mock.calls[0]?.[0]).toMatchObject({ rawBody: raw });
  });

  it("registo público: 413 com CORS, sem enviar código", async () => {
    const response = await postTo(
      "@/routes/api/saas/signup.email-code",
      post("/api/saas/signup/email-code", JSON.stringify({ email: `${"a".repeat(20_000)}@x.ao` }), {
        origin: "https://www.portal-siga.com",
      }),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Pedido demasiado grande." });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://www.portal-siga.com");
    expect(mocks.requestSignupEmailCode).not.toHaveBeenCalled();
  });

  it("app móvel: 413 PAYLOAD_TOO_LARGE, sem cache; JSON inválido continua a ser null", async () => {
    const { mobileRespond, readMobileJson } = await import("@/features/mobile/api-response");
    const big = post("/api/mobile/chat", JSON.stringify({ text: "x".repeat(100) }));
    const response = await mobileRespond(big, "api/mobile/chat", () => readMobileJson(big, 32));
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: "PAYLOAD_TOO_LARGE" });

    await expect(readMobileJson(post("/api/mobile/chat", "{"), 32)).resolves.toBeNull();
  });

  it("consola (site): 413 depois de confirmar o administrador", async () => {
    mocks.requirePlatformAdminFromRequest.mockResolvedValue("admin-1");
    const { readBody, withSiteAdmin } = await import("@/features/saas/site-admin-route");
    const { z } = await import("zod");
    const request = post("/api/saas/site/faqs", JSON.stringify({ q: "x".repeat(300_000) }));
    const response = await withSiteAdmin(request, "Falhou.", () => readBody(request, z.object({})));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Pedido demasiado grande." });
  });
});
