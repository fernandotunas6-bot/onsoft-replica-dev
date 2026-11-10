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
async function fetchFromWorker(path, accept = "text/html") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
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
