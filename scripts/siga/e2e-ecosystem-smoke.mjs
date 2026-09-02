#!/usr/bin/env node
/**
 * Smoke test manual/automático do ecossistema (Fase 13).
 * Requer apps locais a correr. Não cria tenants reais.
 * SIGA_E2E_CI=1 — tolera 500 nas APIs SaaS quando Supabase não está configurado.
 */
const CI = process.env.SIGA_E2E_CI === "1";

function expectStatus(item) {
  if (!CI || !item.label.startsWith("API")) return item.expect;
  return [...new Set([...item.expect, 500])];
}

const endpoints = [
  { label: "SIGA", url: "http://localhost:3006/", expect: [200, 302] },
  { label: "WEB", url: "http://localhost:5174/", expect: [200] },
  { label: "WEB /start", url: "http://localhost:5174/start", expect: [200] },
  { label: "WEB /pricing", url: "http://localhost:5174/pricing", expect: [200] },
  { label: "DOC web manual", url: "http://localhost:5173/web/criar-escola", expect: [200] },
  { label: "DOC admin manual", url: "http://localhost:5173/admin/control-center", expect: [200] },
  { label: "ADMIN tenants", url: "http://localhost:3005/tenants", expect: [200, 307] },
  { label: "DOC", url: "http://localhost:5173/", expect: [200] },
  { label: "API plans", url: "http://localhost:3006/api/saas/plans", expect: [200] },
  {
    label: "API tenant lookup (missing slug)",
    url: "http://localhost:3006/api/saas/tenants/lookup",
    expect: [400],
  },
  {
    label: "API tenant lookup (unknown slug)",
    url: "http://localhost:3006/api/saas/tenants/lookup?slug=nao-existe-e2e",
    expect: [404],
  },
  { label: "API me (anon)", url: "http://localhost:3006/api/saas/me", expect: [401] },
  { label: "API stats (anon GET)", url: "http://localhost:3006/api/saas/stats", expect: [401] },
  {
    label: "API subscription (anon POST)",
    url: "http://localhost:3006/api/saas/tenants/subscription",
    method: "POST",
    body: JSON.stringify({
      tenantId: "11111111-1111-1111-1111-111111111111",
      plan_code: "start",
    }),
    expect: [401],
  },
  {
    label: "API signup (anon POST)",
    url: "http://localhost:3006/api/saas/signup",
    method: "POST",
    body: "{}",
    expect: [400],
  },
  {
    label: "API usage sync (anon POST)",
    url: "http://localhost:3006/api/saas/usage/sync",
    method: "POST",
    expect: [401],
  },
  { label: "API domains (anon GET)", url: "http://localhost:3006/api/saas/domains", expect: [401] },
  { label: "API subscriptions (anon GET)", url: "http://localhost:3006/api/saas/subscriptions", expect: [401] },
  {
    label: "API subscriptions backfill (anon POST)",
    url: "http://localhost:3006/api/saas/subscriptions/backfill",
    method: "POST",
    expect: [401],
  },
  {
    label: "API domains (anon POST)",
    url: "http://localhost:3006/api/saas/domains",
    method: "POST",
    body: JSON.stringify({
      tenantId: "11111111-1111-1111-1111-111111111111",
      hostname: "portal.e2e.test",
    }),
    expect: [401],
  },
  {
    label: "API domains verify (anon POST)",
    url: "http://localhost:3006/api/saas/domains/verify",
    method: "POST",
    body: JSON.stringify({ domainId: "11111111-1111-1111-1111-111111111111" }),
    expect: [401],
  },
  {
    label: "API finance gateway (anon POST)",
    url: "http://localhost:3006/api/finance/gateway/confirm",
    method: "POST",
    body: JSON.stringify({ apiKey: "invalid-key", reference: "123456789", amount: 1 }),
    expect: [401],
  },
  {
    label: "API finance gateway unitel (anon POST)",
    url: "http://localhost:3006/api/finance/gateway/unitel/confirm",
    method: "POST",
    body: JSON.stringify({ apiKey: "invalid-key", reference: "123456789", amount: 1 }),
    expect: [401],
  },
  {
    label: "SIGA matrícula demo",
    url: "http://localhost:3006/matricula/dom-afonso-demo",
    expect: [200],
  },
  { label: "ADMIN domains", url: "http://localhost:3005/domains", expect: [200, 307] },
  { label: "ADMIN subscriptions", url: "http://localhost:3005/subscriptions", expect: [200, 307] },
];

let failed = 0;

for (const item of endpoints) {
  try {
    const res = await fetch(item.url, {
      redirect: "manual",
      method: item.method ?? "GET",
      headers: item.body ? { "Content-Type": "application/json" } : undefined,
      body: item.body,
    });
    const ok = expectStatus(item).includes(res.status);
    const mark = ok ? "OK" : "FAIL";
    console.log(`${mark}  ${item.label} → ${res.status} ${item.url}`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${item.label} → ${error instanceof Error ? error.message : error}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} verificação(ões) falharam. Confirme: npm run dev:ecosystem`);
  process.exit(1);
}

console.log("\nSmoke E2E local OK — fluxo comercial pode ser testado em http://localhost:5174/start");
