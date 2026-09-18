#!/usr/bin/env node
/**
 * Propaga variáveis do .env raiz para painel/web/.env.local e painel/admin/.env.local.
 * Nunca imprime valores — apenas chaves sincronizadas.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = resolve(root, ".env");

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function pick(env, ...keys) {
  for (const k of keys) {
    if (env[k]) return env[k];
  }
  return undefined;
}

function buildBlock(title, entries) {
  const lines = [`# ${title}`, "# Gerado por npm run siga:sync-env — não commitar secrets."];
  for (const [k, v] of entries) {
    if (v) lines.push(`${k}=${v}`);
  }
  return `${lines.join("\n")}\n`;
}

if (!existsSync(envPath)) {
  console.error("sync-ecosystem-env: .env raiz não encontrado. Copie .env.example primeiro.");
  process.exit(1);
}

const env = parseEnv(readFileSync(envPath, "utf8"));

const webUrl = pick(env, "VITE_WEB_URL") || "http://localhost:5174";
const sigaUrl = pick(env, "VITE_SIGA_URL") || "http://localhost:3006";
const adminUrl = pick(env, "VITE_ADMIN_URL") || "http://localhost:3005";
const docsUrl = pick(env, "VITE_DOCS_URL") || "http://localhost:5173";

const supabaseUrl = pick(env, "VITE_SUPABASE_URL", "SUPABASE_URL");
const supabaseKey = pick(
  env,
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
);

const webLocal = resolve(root, "painel/web/.env.local");
const adminLocal = resolve(root, "painel/admin/.env.local");

const webContent = buildBlock("SIGA Plus WEB — ecossistema", [
  ["VITE_WEB_URL", webUrl],
  ["VITE_SIGA_URL", sigaUrl],
  ["VITE_ADMIN_URL", adminUrl],
  ["VITE_DOCS_URL", docsUrl],
  ["VITE_SUPABASE_URL", supabaseUrl],
  ["VITE_SUPABASE_PUBLISHABLE_KEY", supabaseKey],
]);

const adminContent = buildBlock("SIGA Plus ADMIN — ecossistema", [
  ["NEXT_PUBLIC_WEB_URL", webUrl],
  ["NEXT_PUBLIC_SIGA_URL", sigaUrl],
  ["NEXT_PUBLIC_ADMIN_URL", adminUrl],
  ["NEXT_PUBLIC_DOCS_URL", docsUrl],
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", supabaseKey],
]);

writeFileSync(webLocal, webContent);
writeFileSync(adminLocal, adminContent);

const syncedKeys = [
  "VITE_WEB_URL",
  "VITE_SIGA_URL",
  "VITE_ADMIN_URL",
  "VITE_DOCS_URL",
  ...(supabaseUrl ? ["SUPABASE_URL"] : []),
  ...(supabaseKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
];
console.log(`sync-ecosystem-env: OK → painel/web/.env.local, painel/admin/.env.local`);
console.log(`  chaves propagadas: ${syncedKeys.join(", ")}`);
