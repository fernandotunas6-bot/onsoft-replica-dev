#!/usr/bin/env node
/**
 * Dispara POST /api/v1/bank-movements/pull no PayFlow (conector configurado no servidor).
 *
 * Uso:
 *   npm run siga:payflow-bank-pull -- --school-id=<uuid>
 *
 * Sandbox local (feed embutido):
 *   PAYFLOW_RUNTIME_MODE=sandbox
 *   PAYFLOW_BANK_CONNECTOR_URL=http://localhost:3007/api/v1/bank-movements/sandbox-feed
 *   PAYFLOW_BANK_CONNECTOR_KEY=<≥16 chars>
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/i);
    if (match) out[match[1].replace(/-/g, "_")] = match[2];
  }
  return out;
}

function printHelp() {
  console.log(`Pull do conector bancário → PayFlow

Pré-requisitos:
  1. PayFlow a correr (:3007)
  2. PAYFLOW_INTEGRATION_API_KEY (≥24)
  3. PAYFLOW_BANK_CONNECTOR_URL + PAYFLOW_BANK_CONNECTOR_KEY no servidor PayFlow

Sandbox local:
  PAYFLOW_RUNTIME_MODE=sandbox
  PAYFLOW_BANK_CONNECTOR_URL=http://localhost:3007/api/v1/bank-movements/sandbox-feed
  PAYFLOW_BANK_CONNECTOR_KEY=local-bank-connector-key

Uso:
  npm run siga:payflow-bank-pull -- --school-id=<uuid>

Opções:
  --school-id   Obrigatório
  --api-key     Override de PAYFLOW_INTEGRATION_API_KEY
  --url         Override (default VITE_PAYFLOW_URL ou http://localhost:3007)
`);
}

loadEnvFile(resolve(root, ".env"));
loadEnvFile(resolve(root, "painel/payflow/.env.local"));
loadEnvFile(resolve(root, "painel/payflow/.env"));

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const payflowUrl = (
  args.url ||
  process.env.VITE_PAYFLOW_URL ||
  process.env.PAYFLOW_URL ||
  "http://localhost:3007"
).replace(/\/$/, "");
const apiKey = args.api_key || process.env.PAYFLOW_INTEGRATION_API_KEY || "";
const schoolId = args.school_id;

if (!schoolId) {
  console.error("Falta --school-id. Use --help.");
  process.exit(1);
}
if (apiKey.length < 24) {
  console.error("PAYFLOW_INTEGRATION_API_KEY em falta ou com menos de 24 caracteres.");
  process.exit(1);
}

const response = await fetch(`${payflowUrl}/api/v1/bank-movements/pull`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({ school_id: schoolId }),
});

const text = await response.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

console.log(JSON.stringify({ status: response.status, body: json }, null, 2));
process.exit(response.ok ? 0 : 1);
