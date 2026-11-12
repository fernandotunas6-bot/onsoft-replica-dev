import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const env = {};
for (const line of (await readFile(".env", "utf8")).split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const source = await readFile("tests/security/rls-live-probe.test.ts", "utf8");
const tables = [...source.matchAll(/table:\s*"([a-z_]+)"/g)].map((m) => m[1]);
const anon = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);
const results = [];
for (const table of [...new Set(tables)]) {
  const start = Date.now();
  const { data, error } = await anon.from(table).select("*").limit(1);
  results.push({
    table,
    code: error?.code || null,
    row_count: data?.length ?? 0,
    status: error ? "recusado" : data?.length ? "devolveu_dados" : "consultavel_vazio",
    elapsed_ms: Date.now() - start,
  });
}
await writeFile(
  "docs/auditoria/2026-10-07/evidencias/anon-probe.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.row_count > 0)) process.exitCode = 1;
