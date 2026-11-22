import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const env = {};",
      };
    }
    return nextResolve(specifier, context);
  },
});

/** Pedido ao Worker compilado (dist/server), como em rendered-html.test.mjs. */
async function fetchFromWorker(
  path,
  accept = "text/html",
  { enabled = true, method = "GET" } = {},
) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { method, headers: { accept } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      // Desligado por omissão (lib/service-switch.ts); `enabled: false` simula a produção
      // sem a variável.
      ...(enabled ? { PAYFLOW_ENABLED: "true" } : {}),
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function assertSecurityBaseline(response, where) {
  const header = (name) => response.headers.get(name) ?? "";
  assert.equal(header("x-frame-options"), "DENY", `${where}: X-Frame-Options`);
  assert.equal(header("content-security-policy"), "frame-ancestors 'none'", `${where}: CSP`);
  assert.equal(header("x-content-type-options"), "nosniff", `${where}: nosniff`);
  assert.match(header("strict-transport-security"), /^max-age=\d{7,}/, `${where}: HSTS`);
  assert.equal(header("referrer-policy"), "strict-origin-when-cross-origin", `${where}: referrer`);
  assert.match(header("permissions-policy"), /camera=\(\).*payment=\(\)/, `${where}: permissions`);
}

test("a página inicial não pode ser embebida noutro site", async () => {
  const response = await fetchFromWorker("/");
  assert.equal(response.status, 200);
  assertSecurityBaseline(response, "/");
  assert.equal(response.headers.get("x-robots-tag"), null, "/ continua indexável");
});

test("a API leva os mesmos cabeçalhos e fica fora dos motores de pesquisa", async () => {
  const response = await fetchFromWorker("/api/v1/health", "application/json");
  assertSecurityBaseline(response, "/api/v1/health");
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
});

test("o portal do pagador não é indexado", async () => {
  const response = await fetchFromWorker("/aluno/pagar");
  assertSecurityBaseline(response, "/aluno/pagar");
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
});

test("desactivado: sem PAYFLOW_ENABLED, nenhuma página nem API responde", async () => {
  for (const [path, accept, method] of [
    ["/", "text/html", "GET"],
    ["/aluno/pagar", "text/html", "GET"],
    ["/admin", "text/html", "GET"],
    ["/api/v1/admin/login", "application/json", "POST"],
    ["/api/v1/payments", "application/json", "POST"],
    ["/api/v1/webhooks/emis", "application/json", "POST"],
  ]) {
    const response = await fetchFromWorker(path, accept, { enabled: false, method });
    assert.equal(response.status, 503, `${method} ${path}`);
    assertSecurityBaseline(response, path);
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/, `${path}: noindex`);
    assert.equal(response.headers.get("cache-control"), "no-store", `${path}: no-store`);
    assert.equal(response.headers.get("set-cookie"), null, `${path}: sem sessão`);
  }
});

test("desactivado: o health responde 200 com status disabled, sem tocar na base", async () => {
  const response = await fetchFromWorker("/api/v1/health", "application/json", { enabled: false });
  assert.equal(response.status, 200);
  assertSecurityBaseline(response, "/api/v1/health");
  const body = await response.json();
  assert.equal(body.data.status, "disabled");
  assert.equal(body.data.service, "payflow");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});
