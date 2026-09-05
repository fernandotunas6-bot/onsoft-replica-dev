#!/usr/bin/env node
/**
 * Simula conector bancário → POST /api/v1/bank-movements/ingest (PayFlow)
 *
 * Uso:
 *   npm run siga:payflow-bank-ingest -- \
 *     --school-id=<uuid> \
 *     --transfer-reference=PF-TF-20260905-ABC123DEAD \
 *     --amount-minor=1500000
 *
 * Pré-requisitos: PayFlow em :3007 e PAYFLOW_INTEGRATION_API_KEY (≥24) no .env
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

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
  console.log(`Simulador de ingestão bancária → PayFlow

Pré-requisitos:
  1. PayFlow a correr (npm run dev:payflow) na porta 3007
  2. PAYFLOW_INTEGRATION_API_KEY no .env / painel/payflow/.env.local (≥24 chars)
  3. Pagamento pending no PayFlow com a mesma transfer_reference e school_id

Uso:
  npm run siga:payflow-bank-ingest -- --school-id=<uuid> --transfer-reference=PF-TF-... --amount-minor=1500000

Opções:
  --school-id            Obrigatório (tenant no PayFlow)
  --transfer-reference   Obrigatório (ex. PF-TF-20260905-ABC123DEAD)
  --amount-minor         Obrigatório (cêntimos AOA; 1500000 = 15.000,00 Kz)
  --currency             Default AOA
  --bank-transaction-id  Default aleatório MOV-…
  --booked-at            ISO datetime (default: agora)
  --verified-by          Default payflow_bank_ingest_simulate
  --api-key              Override de PAYFLOW_INTEGRATION_API_KEY
  --url                  Override (default VITE_PAYFLOW_URL ou http://localhost:3007)

Endpoint:
  POST {PAYFLOW_URL}/api/v1/bank-movements/ingest
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
const transferReference = (args.transfer_reference || "").toUpperCase();
const amountMinor = Number(args.amount_minor);
const currency = (args.currency || "AOA").toUpperCase();
const bankTransactionId =
  args.bank_transaction_id || `MOV-${randomBytes(6).toString("hex").toUpperCase()}`;
const bookedAt = args.booked_at || new Date().toISOString();
const verifiedBy = args.verified_by || "payflow_bank_ingest_simulate";

if (!schoolId || !transferReference || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
  console.error("Faltam --school-id, --transfer-reference e --amount-minor (inteiro > 0). Use --help.");
  process.exit(1);
}
if (apiKey.length < 24) {
  console.error("PAYFLOW_INTEGRATION_API_KEY em falta ou com menos de 24 caracteres.");
  process.exit(1);
}

const body = {
  school_id: schoolId,
  transfer_reference: transferReference,
  amount: amountMinor,
  currency,
  bank_transaction_id: bankTransactionId,
  booked_at: bookedAt,
  verified_by: verifiedBy,
};

const res = await fetch(`${payflowUrl}/api/v1/bank-movements/ingest`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

console.log(JSON.stringify({ status: res.status, request: body, response: json }, null, 2));
process.exit(res.ok ? 0 : 1);
