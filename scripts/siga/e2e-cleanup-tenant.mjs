#!/usr/bin/env node
/**
 * Remove um tenant E2E criado por testes @live.
 *
 * Uso:
 *   node scripts/siga/e2e-cleanup-tenant.mjs --slug=e2e-abc --email=e2e+e2e-abc@siga-plus.test
 */
import { cleanupE2ETenantBySlug, getSupabaseAdmin } from "./e2e-cleanup-lib.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === `--${name}`) {
      const idx = process.argv.indexOf(arg);
      return process.argv[idx + 1] ?? "";
    }
  }
  return undefined;
}

const slug = readArg("slug");
const email = readArg("email");

if (!slug) {
  console.error("Uso: node scripts/siga/e2e-cleanup-tenant.mjs --slug=<slug> [--email=<admin>]");
  process.exit(1);
}

try {
  const admin = getSupabaseAdmin();
  const result = await cleanupE2ETenantBySlug(admin, slug, email);
  if (result.removed) {
    console.log(`OK   tenant ${slug} removido`);
  } else {
    console.log(`SKIP tenant ${slug} não encontrado`);
  }
} catch (error) {
  console.error(`FAIL ${slug}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
