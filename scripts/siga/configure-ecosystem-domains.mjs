#!/usr/bin/env node
/**
 * Liga os hosts fixos do ecossistema em {{PLATFORM_DOMAIN}} (Cloudflare).
 *
 * Alvos:
 *   www.{{DOMAIN}}      → Pages siga-web
 *   admin.{{DOMAIN}}    → Pages siga-admin
 *   docs.{{DOMAIN}}     → Pages siga-docs
 *   app.{{DOMAIN}}      → Worker SIGA
 *   payflow.{{DOMAIN}}  → Worker siga-plus-payflow
 *
 * O wildcard `*.{{DOMAIN}}/*` (escolas → SIGA) engole www/admin/docs.
 * Por isso criamos rotas mais específicas com `script: null` nesses hosts
 * (bypass Worker) e depois ligamos os custom domains Pages.
 *
 * Requer no .env (token com Zone DNS + Workers Routes + Pages Edit):
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_ZONE_ID
 *   PLATFORM_DOMAIN=portal-siga.com   (opcional)
 *
 * Uso: node scripts/siga/configure-ecosystem-domains.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envFile = path.join(root, ".env");
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const TOKEN = env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const ZONE = env.CLOUDFLARE_ZONE_ID || process.env.CLOUDFLARE_ZONE_ID;
const PLATFORM = (env.PLATFORM_DOMAIN || process.env.PLATFORM_DOMAIN || "portal-siga.com")
  .trim()
  .toLowerCase();

if (!TOKEN || !ACCOUNT || !ZONE) {
  console.error("Falta CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_ZONE_ID no .env");
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function cf(method, urlPath, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${urlPath}`, {
    method,
    headers: AUTH,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}

function fail(label, json) {
  console.error(`✗ ${label}`, JSON.stringify(json.errors || json, null, 2));
}

/**
 * O wildcard `*.{{DOMAIN}}`, que é o que faz `escola.{{DOMAIN}}` existir.
 *
 * Este script assumia-o criado — só o lia, em `findSigaWorker` — e não estava.
 * Consequência: a base marca todos os domínios de escola como `active`, o
 * provisionamento dá a criação por boa, e nenhum subdomínio de escola resolve.
 * Foi o achado mais consequente desta auditoria (PRD-01).
 *
 * São duas peças, e faltar uma não resolve nada:
 *
 *   1. **Registo DNS.** A Cloudflare exige um registo DNS para o nome ser
 *      proxied e poder invocar um Worker — uma rota com wildcard não faz um
 *      nome resolver por si. Registos wildcard proxied estão disponíveis em
 *      todos os planos, incluindo o Free, que é o desta zona.
 *   2. **Rota do Worker** `*.{{DOMAIN}}/*` → SIGA, criada mais abaixo.
 *
 * Usa-se `CNAME *.{{DOMAIN}} → {{DOMAIN}}`, proxied, em vez do prefixo de
 * descarte `AAAA 100::`: a própria Cloudflare desaconselha o segundo, e como
 * é proxied com Worker à frente a origem nunca é contactada. Um Custom Domain
 * não serve aqui — esses são hostnames exactos, e o que se quer é o wildcard.
 */
async function ensureWildcardDns() {
  const name = `*.${PLATFORM}`;
  const list = await cf("GET", `/zones/${ZONE}/dns_records?name=${encodeURIComponent(name)}`);
  if (!list.success) {
    const motivo = (list.errors || []).map((e) => e.message).join("; ");
    console.error(`✗ Não foi possível ler os registos DNS: ${motivo || "erro desconhecido"}`);
    console.error(
      "   O token precisa da permissão Zone → DNS → Edit nesta zona. " +
        "Sem ela este passo não pode correr, e é ele que torna as escolas alcançáveis.",
    );
    return false;
  }

  const existente = (list.result || [])[0];
  if (existente) {
    if (existente.proxied) {
      console.log(`· DNS: ${name} já existe (${existente.type} → ${existente.content}, proxied)`);
      return true;
    }
    // Existe mas sem proxy: o Worker nunca vê o pedido, logo a escola continua
    // inalcançável. Corrigir em vez de dar por feito.
    const patch = await cf("PATCH", `/zones/${ZONE}/dns_records/${existente.id}`, {
      proxied: true,
    });
    if (!patch.success) {
      fail(`activar proxy em ${name}`, patch);
      return false;
    }
    console.log(`✓ DNS: ${name} passou a proxied`);
    return true;
  }

  const created = await cf("POST", `/zones/${ZONE}/dns_records`, {
    type: "CNAME",
    name,
    content: PLATFORM,
    proxied: true,
    ttl: 1,
    comment: "Escolas SIGA: escola.{{DOMAIN}} → Worker. Ver PRD-01 da auditoria.".replace(
      "{{DOMAIN}}",
      PLATFORM,
    ),
  });
  if (!created.success) {
    fail(`criar ${name}`, created);
    return false;
  }
  console.log(`✓ DNS: ${name} criado (CNAME → ${PLATFORM}, proxied)`);
  return true;
}

async function ensurePagesDomain(project, hostname) {
  const list = await cf("GET", `/accounts/${ACCOUNT}/pages/projects/${project}/domains`);
  if (!list.success) {
    fail(`list domains ${project}`, list);
    return false;
  }
  const hit = (list.result || []).find((d) => d.name === hostname);
  if (hit) {
    console.log(`· Pages ${project}: ${hostname} já ligado (${hit.status || "ok"})`);
    return true;
  }
  const created = await cf("POST", `/accounts/${ACCOUNT}/pages/projects/${project}/domains`, {
    name: hostname,
  });
  if (!created.success) {
    fail(`add domain ${hostname} → ${project}`, created);
    return false;
  }
  console.log(
    `✓ Pages ${project}: ${hostname} adicionado (status=${created.result?.status || "?"})`,
  );
  return true;
}

async function ensureWorkerDomain(service, hostname) {
  const list = await cf("GET", `/accounts/${ACCOUNT}/workers/domains`);
  if (!list.success) {
    fail("list worker domains", list);
    return false;
  }
  const hit = (list.result || []).find((d) => d.hostname === hostname);
  if (hit && hit.service === service) {
    console.log(`· Worker ${service}: ${hostname} já ligado`);
    return true;
  }
  const put = await cf("PUT", `/accounts/${ACCOUNT}/workers/domains`, {
    hostname,
    service,
    environment: "production",
    zone_id: ZONE,
  });
  if (!put.success) {
    fail(`worker domain ${hostname} → ${service}`, put);
    return false;
  }
  console.log(`✓ Worker ${service}: ${hostname} ligado`);
  return true;
}

/** @param {string|null} script  null = bypass Worker (Pages / origin) */
async function ensureWorkerRoute(pattern, script) {
  const list = await cf("GET", `/zones/${ZONE}/workers/routes`);
  if (!list.success) {
    fail("list routes", list);
    return false;
  }
  const hit = (list.result || []).find((r) => r.pattern === pattern);
  const body = script === null ? { pattern } : { pattern, script };

  if (hit) {
    const same =
      script === null
        ? hit.script === null || hit.script === undefined || hit.script === ""
        : hit.script === script;
    if (same) {
      console.log(`· Route ${pattern} → ${script ?? "(bypass)"} ok`);
      return true;
    }
    const upd = await cf("PUT", `/zones/${ZONE}/workers/routes/${hit.id}`, body);
    if (!upd.success) {
      fail(`update route ${pattern}`, upd);
      return false;
    }
    console.log(`✓ Route actualizada ${pattern} → ${script ?? "(bypass)"}`);
    return true;
  }

  // API: omitir script ou script:null = não invocar Worker
  const created = await cf("POST", `/zones/${ZONE}/workers/routes`, body);
  if (!created.success) {
    // fallback: alguns tokens/planos querem script explícito vazio
    if (script === null) {
      const retry = await cf("POST", `/zones/${ZONE}/workers/routes`, { pattern, script: null });
      if (retry.success) {
        console.log(`✓ Route criada ${pattern} → (bypass)`);
        return true;
      }
      fail(`create route ${pattern}`, retry);
      return false;
    }
    fail(`create route ${pattern}`, created);
    return false;
  }
  console.log(`✓ Route criada ${pattern} → ${script ?? "(bypass)"}`);
  return true;
}

async function findSigaWorker() {
  const list = await cf("GET", `/accounts/${ACCOUNT}/workers/domains`);
  if (list.success) {
    const apex = (list.result || []).find((d) => d.hostname === PLATFORM);
    if (apex?.service) return apex.service;
  }
  const routes = await cf("GET", `/zones/${ZONE}/workers/routes`);
  if (routes.success) {
    const wild = (routes.result || []).find((r) => r.pattern === `*.${PLATFORM}/*`);
    if (wild?.script) return wild.script;
  }
  return "fernandotunas6-bot-onsoft-replica-dev";
}

console.log(`=== Configurar hosts do ecossistema em ${PLATFORM} ===\n`);

const verify = await cf("GET", "/user/tokens/verify");
if (!verify.success || verify.result?.status !== "active") {
  fail("token verify", verify);
  process.exit(1);
}

const sigaWorker = await findSigaWorker();
console.log(`SIGA worker: ${sigaWorker}\n`);

const results = [];

// 0) O wildcard primeiro: é o que faz as escolas existirem. Os passos
// seguintes criam excepções mais específicas por cima dele.
results.push(await ensureWildcardDns());
results.push(await ensureWorkerRoute(`*.${PLATFORM}/*`, sigaWorker));

// 1) Bypass Worker nos hosts Pages (mais específico que o wildcard)
for (const host of [`www.${PLATFORM}`, `admin.${PLATFORM}`, `docs.${PLATFORM}`]) {
  results.push(await ensureWorkerRoute(`${host}/*`, null));
}

// 2) Custom domains Pages
results.push(await ensurePagesDomain("siga-web", `www.${PLATFORM}`));
results.push(await ensurePagesDomain("siga-admin", `admin.${PLATFORM}`));
results.push(await ensurePagesDomain("siga-docs", `docs.${PLATFORM}`));

// 3) Workers custom domains
results.push(await ensureWorkerDomain(sigaWorker, `app.${PLATFORM}`));
results.push(await ensureWorkerDomain("siga-plus-payflow", `payflow.${PLATFORM}`));
results.push(await ensureWorkerRoute(`payflow.${PLATFORM}/*`, "siga-plus-payflow"));
results.push(await ensureWorkerRoute(`app.${PLATFORM}/*`, sigaWorker));

const routes = await cf("GET", `/zones/${ZONE}/workers/routes`);
if (routes.success) {
  console.log("\nRotas actuais:");
  for (const r of routes.result || []) {
    console.log(`  ${r.pattern} → ${r.script ?? "(bypass)"}`);
  }
}

const domains = await cf("GET", `/accounts/${ACCOUNT}/workers/domains`);
if (domains.success) {
  console.log("\nWorker custom domains:");
  for (const d of domains.result || []) {
    console.log(`  ${d.hostname} → ${d.service}`);
  }
}

console.log(`
Verificar:
  https://www.${PLATFORM}
  https://admin.${PLATFORM}
  https://docs.${PLATFORM}
  https://app.${PLATFORM}
  https://payflow.${PLATFORM}/api/v1/health
`);

const failed = results.filter((x) => !x).length;
if (failed) {
  console.error(`\n${failed} passo(s) falharam. O token precisa de:`);
  console.error("  - Account: Cloudflare Pages Edit");
  console.error("  - Account: Workers Scripts / Workers Routes Edit");
  console.error("  - Zone portal-siga.com: DNS Edit + Workers Routes Edit");
  process.exit(1);
}
console.log("\nConcluído sem falhas.");
