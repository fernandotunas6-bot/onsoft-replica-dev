#!/usr/bin/env node
/**
 * Publicação do Mobile V4 ligado ao SIGA, nos passos de docs/CLOUDFLARE_PAGES.md.
 *
 *   node scripts/publish.mjs preview
 *     Constrói `dist-connected`, publica-o como preview no projecto Pages
 *     (branch staging-mobile-v4-pr116) e verifica o URL fixo devolvido.
 *     Não toca no domínio público.
 *
 *   node scripts/publish.mjs promote <url-do-preview> --public
 *     Verifica de novo o preview, muda só `PAGES_ORIGIN` do Worker do domínio
 *     (deployment/wrangler.jsonc) e verifica m.portal-siga.com. Sem `--public`
 *     não faz nada: mudar o domínio público é uma decisão explícita.
 *
 *   node scripts/publish.mjs check <url>
 *     Só as verificações, contra qualquer endereço.
 *
 * Precisa de CLOUDFLARE_API_TOKEN (Pages: Edit e Workers Scripts: Edit na
 * conta abaixo). O token nunca é escrito em ficheiros nem mostrado.
 * Reversão: `promote <url-anterior> --public` (o URL anterior fica impresso).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ACCOUNT_ID = "701800d01d428c5141fa1fdb60ee01ae";
export const PROJECT = "siga-plus-mobile-v4";
export const BRANCH = "staging-mobile-v4-pr116";
export const PUBLIC_ORIGIN = "https://m.portal-siga.com";
const WRANGLER = ["--yes", "wrangler@4"];
const CONFIG = fileURLToPath(new URL("../deployment/wrangler.jsonc", import.meta.url));
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCHOOL = "00000000-0000-4000-8000-000000000000";

/**
 * O que um endereço do Mobile tem de cumprir antes e depois de publicar
 * (a mesma lista da verificação de 10/10/2026). Devolve as falhas; vazio = ok.
 */
export async function verify(base, fetchImpl = fetch) {
  const failures = [];
  const expect = async (label, path, init, status, extra) => {
    try {
      const res = await fetchImpl(base.replace(/\/$/, "") + path, { redirect: "manual", ...init });
      if (res.status !== status) failures.push(`${label}: esperado ${status}, veio ${res.status}`);
      else if (extra) {
        const problem = await extra(res);
        if (problem) failures.push(`${label}: ${problem}`);
      }
    } catch (error) {
      failures.push(`${label}: sem resposta (${error instanceof Error ? error.message : error})`);
    }
  };
  const privateApi = (res) =>
    /no-store/.test(res.headers.get("cache-control") ?? "") ? null : "a API não é no-store";
  await expect("página", "/", {}, 200, async (res) =>
    /text\/html/.test(res.headers.get("content-type") ?? "") ? null : "não é HTML",
  );
  await expect("sessão sem token", "/api/mobile-v4/session", {}, 401, privateApi);
  await expect(
    "token inválido",
    "/api/mobile-v4/session",
    { headers: { authorization: "Bearer invalido" } },
    401,
    privateApi,
  );
  await expect(
    "origem externa",
    "/api/mobile-v4/session",
    { headers: { origin: "https://exemplo.invalid" } },
    403,
  );
  // Rotas novas: 401 prova que existem (uma rota em falta dá 404).
  for (const op of ["academic", "lesson-plans", "documents", "notifications"])
    await expect(`${op} sem token`, `/api/mobile-v4/schools/${SCHOOL}/${op}?role=aluno`, {}, 401);
  await expect(
    "método errado",
    `/api/mobile-v4/schools/${SCHOOL}/documents?role=aluno`,
    { method: "POST", body: "{}", headers: { "content-type": "application/json" } },
    405,
  );
  return failures;
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });
}

function requireToken() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error(
      "Falta CLOUDFLARE_API_TOKEN (Pages: Edit e Workers Scripts: Edit). Defina-o no ambiente; nunca no código.",
    );
    process.exit(2);
  }
  process.env.CLOUDFLARE_ACCOUNT_ID ??= ACCOUNT_ID;
}

async function report(base) {
  const failures = await verify(base);
  for (const f of failures) console.error("✗ " + f);
  if (failures.length) {
    console.error(`${failures.length} verificação(ões) falharam em ${base}.`);
    process.exit(1);
  }
  console.log(`✓ ${base} passou todas as verificações.`);
}

export function readPagesOrigin(config = readFileSync(CONFIG, "utf8")) {
  return /"PAGES_ORIGIN":\s*"([^"]+)"/.exec(config)?.[1] ?? null;
}

export function withPagesOrigin(config, url) {
  if (!/^https:\/\/[0-9a-f]{8}\.siga-plus-mobile-v4\.pages\.dev$/.test(url))
    throw new Error(
      "O destino tem de ser um URL fixo de deployment (https://xxxxxxxx.siga-plus-mobile-v4.pages.dev).",
    );
  return config.replace(/("PAGES_ORIGIN":\s*")[^"]+(")/, `$1${url}$2`);
}

async function main([mode, target, ...flags]) {
  if (mode === "check" && target) return report(target);
  if (mode === "preview") {
    requireToken();
    run("npm", ["run", "-s", "build:connected"], { stdio: "inherit" });
    const sha = run("git", ["rev-parse", "HEAD"]).trim();
    const out = run("npx", [
      ...WRANGLER,
      "pages",
      "deploy",
      "dist-connected",
      "--project-name",
      PROJECT,
      "--branch",
      BRANCH,
      "--commit-hash",
      sha,
      "--commit-dirty=false",
    ]);
    const url = out.match(/https:\/\/[0-9a-f]{8}\.siga-plus-mobile-v4\.pages\.dev/)?.[0];
    if (!url) {
      console.error("Não encontrei o URL fixo do deployment na resposta do wrangler.");
      process.exit(1);
    }
    console.log(`Preview ${url} (commit ${sha}).`);
    await report(url);
    console.log(`Para o pôr em ${PUBLIC_ORIGIN}: node scripts/publish.mjs promote ${url} --public`);
    return;
  }
  if (mode === "promote" && target) {
    if (!flags.includes("--public")) {
      console.error(`Promover muda ${PUBLIC_ORIGIN}. Repita com --public para confirmar.`);
      process.exit(2);
    }
    requireToken();
    await report(target);
    const config = readFileSync(CONFIG, "utf8");
    const previous = readPagesOrigin(config);
    writeFileSync(CONFIG, withPagesOrigin(config, target));
    try {
      run("npx", [...WRANGLER, "deploy", "--config", CONFIG], { stdio: "inherit" });
    } catch (error) {
      writeFileSync(CONFIG, config);
      throw error;
    }
    console.log(`PAGES_ORIGIN: ${previous} → ${target}. Reversão: promote ${previous} --public`);
    await report(PUBLIC_ORIGIN);
    return;
  }
  console.error("Uso: publish.mjs preview | promote <url> --public | check <url>");
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
