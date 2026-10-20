#!/usr/bin/env node
/**
 * Remove tenants E2E órfãos (slugs e2e-*, web-*, mat-*, gw-*) criados por testes @live.
 *
 * Uso (somente leitura): npm run siga:e2e-cleanup-stale
 * Uso (um tenant, após aprovação): npm run siga:e2e-cleanup-stale -- --execute --tenant-id UUID
 */
import { cleanupE2ETenantBySlug, getSupabaseAdmin, isE2ETenantSlug } from "./e2e-cleanup-lib.mjs";
import { parseE2ECleanupArgs } from "./e2e-cleanup-prod-identity.mjs";

let mode;
try {
  mode = parseE2ECleanupArgs(process.argv.slice(2));
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const dryRun = !mode.execute;

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
  return email.endsWith("@siga-plus.test") && (!mode.tenantId || row.id === mode.tenantId);
});
if (mode.execute && stale.length !== 1) {
  console.error("Limpeza bloqueada: UUID não corresponde a exactamente um tenant de teste elegível.");
  process.exit(1);
}

if (!stale.length) {
  console.log("Nenhum tenant E2E órfão encontrado.");
  process.exit(0);
}

console.log(`${dryRun ? "Simulação (sem alterações)" : "Limpeza individual autorizada"}: ${stale.length} tenant(s) E2E…`);
if (dryRun) {
  console.log("Nenhuma eliminação será feita. Para executar, é obrigatório --execute --tenant-id UUID.");
}
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
