#!/usr/bin/env node
/**
 * Auditoria pós-publicação estritamente de leitura. Nunca utiliza credenciais,
 * POST/PUT/PATCH/DELETE, cookies, tokens nem corpos de resposta (dados escolares).
 *
 * Os caminhos são fixos; não é possível apontar estes pedidos a outro tenant.
 * Não substitui homologação autenticada (administrador/professor/aluno).
 */
import { pathToFileURL } from "node:url";

export const CHECKS = Object.freeze([
  {
    name: "SIGA — entrada pública",
    url: "https://portal-siga.com/",
    expected: [200, 302, 307, 308],
  },
  {
    name: "WEB — entrada pública",
    url: "https://siga-web.pages.dev/",
    expected: [200, 302, 307, 308],
  },
  { name: "WEB — criar escola (página)", url: "https://siga-web.pages.dev/start", expected: [200] },
  { name: "DOC — documentação", url: "https://siga-docs.pages.dev/", expected: [200] },
  {
    name: "ADMIN — entrada pública",
    url: "https://siga-admin.pages.dev/",
    expected: [200, 302, 307, 308],
  },
  {
    name: "PAYFLOW — saúde",
    url: "https://payflow.portal-siga.com/api/v1/health",
    expected: [200],
  },
  {
    name: "SIGA — catálogo público de planos",
    url: "https://portal-siga.com/api/saas/plans",
    expected: [200],
  },
  {
    name: "SIGA — sessão anónima recusada",
    url: "https://portal-siga.com/api/saas/me",
    expected: [401],
  },
  {
    name: "SIGA — métricas anónimas recusadas",
    url: "https://portal-siga.com/api/saas/stats",
    expected: [401],
  },
  {
    name: "SIGA — domínios anónimos recusados",
    url: "https://portal-siga.com/api/saas/domains",
    expected: [401],
  },
  {
    name: "SIGA — subscrições anónimas recusadas",
    url: "https://portal-siga.com/api/saas/subscriptions",
    expected: [401],
  },
]);

const ALLOWED_HOSTS = new Set([
  "portal-siga.com",
  "siga-web.pages.dev",
  "siga-admin.pages.dev",
  "siga-docs.pages.dev",
  "payflow.portal-siga.com",
]);

export function validateCheck(check) {
  const url = new URL(check.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !ALLOWED_HOSTS.has(url.hostname) ||
    !["GET", undefined].includes(check.method)
  ) {
    throw new Error("Auditoria: destino não autorizado.");
  }
  return url;
}

export function isExpectedStatus(check, status) {
  return check.expected.includes(status);
}

export async function auditPublicProduction({
  request = fetch,
  log = console.log,
  checks = CHECKS,
  timeoutMs = 12_000,
} = {}) {
  let passed = 0;
  let failed = 0;
  const results = [];
  for (const check of checks) {
    // O check é validado antes de qualquer pedido e os redireccionamentos
    // nunca são seguidos, evitando contactos com destinos não autorizados.
    const url = validateCheck(check);
    try {
      const response = await request(url.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "text/html, application/json" },
      });
      const ok = isExpectedStatus(check, response.status);
      results.push({ name: check.name, status: response.status, ok });
      if (ok) passed++;
      else failed++;
      log(
        `${ok ? "OK" : "FALHA"} ${check.name}: HTTP ${response.status} (esperado: ${check.expected.join("/")})`,
      );
      // Não consultar nem imprimir o corpo: pode conter informação institucional.
      if (response.body?.cancel) await response.body.cancel();
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.name : "NetworkError";
      results.push({ name: check.name, status: null, ok: false });
      log(`FALHA ${check.name}: ${message} (sem leitura de dados)`);
    }
  }
  log(`Auditoria somente leitura: ${passed} aprovações, ${failed} falhas.`);
  return { passed, failed, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await auditPublicProduction();
  if (result.failed > 0) process.exitCode = 1;
}
