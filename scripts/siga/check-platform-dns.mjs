#!/usr/bin/env node
/**
 * Verifica que os hostnames da plataforma resolvem — `npm run siga:check-dns`
 *
 * O provisionamento insere cada escola em `tenant_domains` com
 * `status: "active"` e `ssl_status: "active"`, e isso é correcto **por
 * desenho**: o wildcard `*.PLATFORM_DOMAIN` é que faz o subdomínio funcionar,
 * sem acção por escola (docs/cloudflare/OVERVIEW.md).
 *
 * O problema é que, se o wildcard não existir, a base afirma `active` para
 * domínios que não resolvem — e nada o desmente. Foi assim que todas as escolas
 * criadas ficaram inalcançáveis sem ninguém notar: o registo dizia que estava
 * tudo bem.
 *
 * Este script pergunta ao DNS em vez de acreditar na base.
 */
import { resolve4 } from "node:dns/promises";
import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");

function platformDomain() {
  const envPath = resolvePath(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^PLATFORM_DOMAIN\s*=\s*(.+)$/);
      if (m && m[1].trim()) return m[1].trim();
    }
  }
  return process.env.PLATFORM_DOMAIN?.trim() || "portal-siga.com";
}

const domain = platformDomain();

// Um slug que nunca existirá: se o wildcard estiver bem posto, resolve; se só
// existirem registos nomeados, não resolve. É o teste decisivo.
const probe = `wildcard-probe-${Date.now().toString(36)}`;

const targets = [
  { host: domain, label: "raiz da plataforma", required: true },
  { host: `app.${domain}`, label: "portal da aplicação", required: true },
  { host: `${probe}.${domain}`, label: "wildcard *." + domain, required: true },
];

async function resolves(host) {
  try {
    const addrs = await resolve4(host);
    return addrs.length > 0 ? addrs.slice(0, 2).join(", ") : null;
  } catch {
    return null;
  }
}

console.log(`Domínio da plataforma: ${domain}\n`);
let falhas = 0;
for (const { host, label, required } of targets) {
  const addrs = await resolves(host);
  const ok = Boolean(addrs);
  if (!ok && required) falhas += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(34)} ${addrs ?? "não resolve"}`);
}

if (falhas) {
  console.log(`\n✗ ${falhas} hostname(s) da plataforma não resolvem.`);
  console.log(`
Se o que falhou foi o wildcard, cada escola criada fica inalcançável no seu
próprio subdomínio — mesmo com \`tenant_domains.status = 'active'\` na base,
porque esse campo não é verificado contra o DNS.

Correcção (Cloudflare → DNS do domínio ${domain}):
  1. Registo  A  ou  CNAME   nome  *   →  mesmo destino de app.${domain}
  2. Confirmar que a rota do Worker cobre \`*.${domain}/*\`
  3. Verificar que as rotas de bypass de www / admin / docs continuam antes do
     wildcard, para ele não as engolir (docs/cloudflare/OVERVIEW.md)

Entretanto, contas com escola atribuída continuam a entrar por
app.${domain}: a resolução cai para a escola da sessão.`);
  process.exit(1);
}

console.log("\n✓ Todos os hostnames da plataforma resolvem.");
