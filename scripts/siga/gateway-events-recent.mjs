import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const out = { limit: 20, failuresOnly: false };
  for (const arg of argv) {
    if (arg === "--failures-only") out.failuresOnly = true;
    const match = arg.match(/^--limit=(\d+)$/);
    if (match) out.limit = Number(match[1]);
  }
  return out;
}

if (process.env.SIGA_IGNORE_DOTENV !== "1") {
  loadEnv();
}

const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
const secret =
  process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !secret) {
  console.error("❌ SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.");
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const db = createClient(url, secret, { auth: { persistSession: false } });

let query = db
  .from("finance_gateway_webhook_events")
  .select(
    "created_at, ok, http_status, channel, message, reference, invoice_id, amount, school_id, provider",
  )
  .order("created_at", { ascending: false })
  .limit(args.limit);

if (args.failuresOnly) {
  query = query.eq("ok", false);
}

const { data, error } = await query;

if (error) {
  if (/does not exist|schema cache/i.test(error.message)) {
    console.log("Tabela finance_gateway_webhook_events em falta — execute supabase/APPLY_IN_SQL_EDITOR.sql");
    process.exit(0);
  }
  console.error("❌", error.message);
  process.exit(1);
}

if (!data?.length) {
  console.log("Nenhum evento de webhook registado.");
  process.exit(0);
}

for (const row of data) {
  const mark = row.ok ? "OK" : "FAIL";
  const ts = row.created_at?.slice(0, 19).replace("T", " ") ?? "";
  console.log(
    `${mark} ${ts} HTTP ${row.http_status} ${row.channel} school=${row.school_id ?? "—"} ref=${row.reference} — ${row.message}`,
  );
}
