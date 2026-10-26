#!/usr/bin/env node
/**
 * Cria .env mínimo para E2E @live na CI a partir de variáveis de ambiente
 * (secrets GitHub). Sem output de valores. Falha fechada se faltar secret.
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertSafeE2ETarget } from "./e2e-safety.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!secret) {
  console.error("prepare-ci-env: SUPABASE_SECRET_KEY é obrigatório para E2E @live.");
  process.exit(1);
}

const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
const publishable =
  process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !publishable) {
  console.error(
    "prepare-ci-env: SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY são obrigatórios com o secret.",
  );
  process.exit(1);
}

assertSafeE2ETarget(process.env);

const lines = [
  `SIGA_E2E_ALLOW_WRITES=${process.env.SIGA_E2E_ALLOW_WRITES}`,
  `SIGA_E2E_PROJECT_REF=${process.env.SIGA_E2E_PROJECT_REF}`,
  `SUPABASE_PROJECT_ID=${process.env.SIGA_E2E_PROJECT_REF}`,
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
