#!/usr/bin/env node
/**
 * Sincroniza tenant_usage da escola demo (Dom Afonso I) para o ADMIN /tenants.
 * Requer seed demo + APPLY_SAAS_PLATFORM aplicados.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = resolve(root, ".env");

function loadEnv() {
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
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
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

const DEMO_SCHOOL_ID = "d3b07384-d113-4603-9c8e-a2f0714b2201";
const DEMO_TENANT_SLUG = "dom-afonso-demo";

if (!url || !key) {
  console.error("❌ Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: school, error: schoolErr } = await supabase
  .from("schools")
  .select("id, tenant_id, name")
  .eq("id", DEMO_SCHOOL_ID)
  .maybeSingle();

if (schoolErr || !school) {
  console.error("❌ Escola demo não encontrada — aplique SEED_ESCOLA_DEMO.sql");
  process.exit(1);
}

let tenantId = school.tenant_id;
if (!tenantId) {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", DEMO_TENANT_SLUG)
    .maybeSingle();
  tenantId = tenant?.id ?? null;
}

if (!tenantId) {
  console.error("❌ Tenant demo não ligado — reaplique SEED_ESCOLA_DEMO.sql (secção tenant SaaS)");
  process.exit(1);
}

const { count: students, error: studentErr } = await supabase
  .from("students")
  .select("*", { count: "exact", head: true })
  .eq("school_id", DEMO_SCHOOL_ID)
  .neq("status", "inactive");

const { count: staff, error: staffErr } = await supabase
  .from("school_memberships")
  .select("*", { count: "exact", head: true })
  .eq("school_id", DEMO_SCHOOL_ID)
  .eq("status", "active");

if (studentErr || staffErr) {
  console.error("❌ Erro ao contar alunos/utilizadores:", studentErr?.message ?? staffErr?.message);
  process.exit(1);
}

const { error: usageErr } = await supabase.from("tenant_usage").upsert(
  {
    tenant_id: tenantId,
    active_students_count: students ?? 0,
    active_staff_count: staff ?? 0,
    last_calculated_at: new Date().toISOString(),
  },
  { onConflict: "tenant_id" },
);

if (usageErr) {
  console.error("❌ Falha ao actualizar tenant_usage:", usageErr.message);
  process.exit(1);
}

console.log(`✅ Utilização sincronizada — ${school.name}`);
console.log(`   Tenant: ${DEMO_TENANT_SLUG} (${tenantId})`);
console.log(`   Alunos activos: ${students ?? 0}`);
console.log(`   Staff activo: ${staff ?? 0}`);
console.log("   Verifique em ADMIN → /tenants");
