import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECKS,
  validateCheck,
  isExpectedStatus,
  auditPublicProduction,
} from "../../scripts/siga/postdeploy-readonly.mjs";

test("destinos fixos são HTTPS e não levam sessão, pesquisa ou tokens", () => {
  assert.equal(CHECKS.length, 11);
  for (const check of CHECKS) {
    const url = validateCheck(check);
    assert.equal(url.protocol, "https:");
    assert.equal(url.search, "");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
  }
});

test("não aceita destinos externos, credenciais, parâmetros ou métodos de escrita", () => {
  for (const url of [
    "http://portal-siga.com/",
    "https://malicioso.test/",
    "https://portal-siga.com@malicioso.test/",
    "https://portal-siga.com/?token=segredo",
    "https://portal-siga.com:444/",
  ]) {
    assert.throws(() => validateCheck({ url, expected: [200] }), /não autorizado/);
  }
  assert.throws(
    () => validateCheck({ url: "https://portal-siga.com/", method: "POST", expected: [200] }),
    /não autorizado/,
  );
});

test("protecção da API nunca aceita HTTP 200 de uma sessão anónima", () => {
  const protectedChecks = CHECKS.filter(
    (check) => check.url.includes("/api/saas/") && check.expected[0] === 401,
  );
  assert.equal(protectedChecks.length, 4);
  for (const check of protectedChecks) {
    assert.ok(isExpectedStatus(check, 401));
    assert.ok(!isExpectedStatus(check, 200));
    assert.ok(!isExpectedStatus(check, 500));
  }
});

test("auditoria usa só GET, não segue redirects nem lê corpos", async () => {
  const calls = [];
  const messages = [];
  const checks = [CHECKS[0], CHECKS[7]];
  const result = await auditPublicProduction({
    checks,
    log: (line) => messages.push(line),
    request: async (url, options) => {
      calls.push({ url, options });
      return {
        status: url.endsWith("/api/saas/me") ? 401 : 200,
        body: { cancel: async () => {} },
      };
    },
  });
  assert.equal(result.passed, 2);
  assert.equal(result.failed, 0);
  assert.equal(calls.length, 2);
  for (const { options } of calls) {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.body, undefined);
    assert.equal(options.credentials, undefined);
  }
  assert.equal(messages.length, 3);
});

test("falha se API protegida divulgar 200 e não mostra o corpo", async () => {
  const messages = [];
  const check = CHECKS.find((item) => item.url.endsWith("/api/saas/stats"));
  const result = await auditPublicProduction({
    checks: [check],
    log: (line) => messages.push(line),
    request: async () => ({
      status: 200,
      body: { cancel: async () => {} },
    }),
  });
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].status, 200);
  assert.ok(messages.some((message) => message.includes("FALHA")));
});

test("erro de rede não imprime mensagens sensíveis", async () => {
  const messages = [];
  const result = await auditPublicProduction({
    checks: [CHECKS[0]],
    log: (line) => messages.push(line),
    request: async () => {
      throw new Error("token secreto, informação privada");
    },
  });
  assert.equal(result.failed, 1);
  assert.ok(!messages.join(" ").includes("token secreto"));
});
