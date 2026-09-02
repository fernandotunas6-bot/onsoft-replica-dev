#!/usr/bin/env node
/**
 * Cria .env mínimo para E2E @live na CI a partir de variáveis de ambiente
 * (secrets GitHub). Sem output de valores. Skip silencioso se secret em falta.
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!secret) {
  console.log("prepare-ci-env: omitido (SUPABASE_SECRET_KEY não definido)");
  process.exit(0);
}

const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
const publishable =
  process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !publishable) {
  console.error("prepare-ci-env: SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY são obrigatórios com o secret.");
  process.exit(1);
}

const lines = [
  "# Gerado por scripts/siga/prepare-ci-env.mjs — não commitar",
  `SUPABASE_URL=${url}`,
  `VITE_SUPABASE_URL=${url}`,
  `SUPABASE_PUBLISHABLE_KEY=${publishable}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publishable}`,
  `SUPABASE_SECRET_KEY=${secret}`,
  "VITE_WEB_URL=http://localhost:5174",
  "VITE_SIGA_URL=http://localhost:3006",
  "VITE_ADMIN_URL=http://localhost:3005",
  "VITE_DOCS_URL=http://localhost:5173",
  "SIGA_GATEWAY_DEV_API_KEY=e2e-gateway-dev-key-ci",
];

writeFileSync(resolve(root, ".env"), `${lines.join("\n")}\n`);

const sync = spawnSync("node", ["scripts/siga/sync-ecosystem-env.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

console.log("prepare-ci-env: .env CI + painéis sincronizados");
