#!/usr/bin/env node
/**
 * Remove tenants E2E órfãos (slugs e2e-*, web-*, mat-*, gw-*) criados por testes @live.
 *
 * Uso: npm run siga:e2e-cleanup-stale
 *      npm run siga:e2e-cleanup-stale -- --dry-run
 */
import {
  cleanupE2ETenantBySlug,
  getSupabaseAdmin,
  isE2ETenantSlug,
} from "./e2e-cleanup-lib.mjs";

const dryRun = process.argv.includes("--dry-run");

let admin;
try {
  admin = getSupabaseAdmin();
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const { data: tenants, error } = await admin.from("tenants").select("id, slug, contact_email");
if (error) {
  console.error(error.message);
  process.exit(1);
}

const stale = (tenants ?? []).filter((row) => {
  const slug = String(row.slug ?? "");
  if (!isE2ETenantSlug(slug)) return false;
  const email = String(row.contact_email ?? "").toLowerCase();
  return email.endsWith("@siga-plus.test");
});

if (!stale.length) {
  console.log("Nenhum tenant E2E órfão encontrado.");
  process.exit(0);
}

console.log(`${dryRun ? "Simulação" : "Limpeza"}: ${stale.length} tenant(s) E2E…`);
let failed = 0;
for (const row of stale) {
  const slug = String(row.slug);
  try {
    if (dryRun) {
      console.log(`DRY  ${slug} → tenant ${row.id}`);
      continue;
    }
    await cleanupE2ETenantBySlug(admin, slug, row.contact_email);
    console.log(`OK   ${slug} removido`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${slug}: ${err instanceof Error ? err.message : err}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
