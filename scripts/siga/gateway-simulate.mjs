#!/usr/bin/env node
/**
 * Simula callback EMIS/Multicaixa ou Unitel → POST webhook SIGA
 *
 * Uso:
 *   npm run siga:gateway-simulate -- --invoice-id=<uuid> [--amount=45000]
 *   npm run siga:gateway-simulate -- --invoice-id=<uuid> --unitel
 *
 * Requer SIGA a correr (npm run dev:ecosystem) e SIGA_GATEWAY_DEV_API_KEY no .env
 */
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { referenceDigitsForInvoice } from "./gateway-reference.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = resolve(root, ".env");

function loadEnv() {
  if (!existsSync(envPath)) return;
  try {
    const text = readFileSync(envPath, "utf8");
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
    if (arg === "--unitel") {
      out.unitel = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/i);
    if (match) out[match[1].replace(/-/g, "_")] = match[2];
  }
  return out;
}

function printHelp() {
  console.log(`Simulador de webhook EMIS → SIGA

Pré-requisitos:
  1. npm run dev:ecosystem  (SIGA :3006)
  2. .env com SUPABASE_SECRET_KEY (register_payment no SGA)
  3. SIGA_GATEWAY_DEV_API_KEY=... no .env

Uso:
  npm run siga:gateway-simulate -- --invoice-id=<uuid-fatura>
  npm run siga:gateway-simulate -- --invoice-id=<uuid> --amount=45000
  npm run siga:gateway-simulate -- --invoice-id=<uuid> --reference=123456789
  npm run siga:gateway-simulate -- --invoice-id=<uuid> --unitel

Opções:
  --invoice-id   Obrigatório (modo dev)
  --unitel       Usar POST /api/finance/gateway/unitel/confirm (canal unitel_money)
  --amount       Montante em Kz (default: 45000)
  --reference    Referência EMIS 9 dígitos (default: calculada da fatura)
  --plan-id      Plano finance_payment_plans (opcional)
  --api-key      Override de SIGA_GATEWAY_DEV_API_KEY
  --url          Override de VITE_SIGA_URL (default http://localhost:3006)

Endpoints:
  POST {SIGA_URL}/api/finance/gateway/confirm
  POST {SIGA_URL}/api/finance/gateway/unitel/confirm  (--unitel)
`);
}

loadEnv();

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const sigaUrl = (
  args.url ||
  process.env.VITE_SIGA_URL ||
  process.env.SIGA_URL ||
  "http://localhost:3006"
).replace(/\/$/, "");
const apiKey = args.api_key || process.env.SIGA_GATEWAY_DEV_API_KEY;
const invoiceId = args.invoice_id;

if (!apiKey) {
  console.error("❌ Defina SIGA_GATEWAY_DEV_API_KEY no .env (ver .env.example)\n");
  printHelp();
  process.exit(1);
}

if (!invoiceId) {
  console.error("❌ Indique --invoice-id=<uuid da fatura>\n");
  printHelp();
  process.exit(1);
}

const amount = Number(args.amount ?? 45000);
const reference = (args.reference || referenceDigitsForInvoice(invoiceId)).replace(/\s+/g, "");
const unitel = Boolean(args.unitel);
const endpoint = unitel
  ? `${sigaUrl}/api/finance/gateway/unitel/confirm`
  : `${sigaUrl}/api/finance/gateway/confirm`;

// A key nunca vai no corpo: assina "<timestamp>.<corpo>" (gateway-webhook-signature.ts).
const body = {
  reference,
  amount,
  invoiceId,
  channel: unitel ? "unitel_money" : "multicaixa_express",
  ...(args.plan_id ? { planId: args.plan_id } : {}),
  externalId: `sim-${Date.now()}`,
};

console.log(`→ POST ${endpoint}`);
console.log(`  reference=${reference} amount=${amount} invoiceId=${invoiceId}`);

try {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac("sha256", apiKey).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SIGA-Timestamp": timestamp,
      "X-SIGA-Signature": signature,
    },
    body: rawBody,
  });
  const payload = await res.json().catch(() => ({}));
  const mark = res.ok ? "✅" : "❌";
  console.log(`${mark} HTTP ${res.status}`);
  console.log(JSON.stringify(payload, null, 2));
  if (!res.ok) process.exit(1);
} catch (error) {
  console.error("❌ Falha de rede — confirme que o SIGA está a correr (npm run dev:ecosystem)");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
