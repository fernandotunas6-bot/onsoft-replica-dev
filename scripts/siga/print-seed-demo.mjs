#!/usr/bin/env node
/**
 * Lembra a ordem de SQL + seed da Escola Demo (Dom Afonso I).
 * Não executa nada no SGA — só imprime instruções para o SQL Editor.
 */
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baseSeed = resolve(root, "supabase/SEED_ESCOLA_DEMO.sql");
const fullSeed = resolve(root, "supabase/SEED_ESCOLA_DEMO_FULL.sql");

console.log("Escola Demo — SIGA Plus (Complexo Dom Afonso I)\n");
console.log("Pré-requisito: scripts canónicos do SGA já aplicados (npm run siga:sql).\n");
console.log("Ordem no SQL Editor do projecto xodgfmxiaunpamctfeea:\n");
console.log("  1. supabase/SEED_ESCOLA_DEMO.sql");
console.log("     → escola, anos lectivos, salas, cursos, formulário público /matricula/dom-afonso-demo");
if (existsSync(fullSeed)) {
  console.log("  2. supabase/SEED_ESCOLA_DEMO_FULL.sql");
  console.log("     → 36 turmas, ~1150 alunos, pautas, histórico (ficheiro grande)");
} else {
  console.log("  2. Gerar carga completa: npm run siga:seed-demo");
  console.log("     → cria supabase/SEED_ESCOLA_DEMO_FULL.sql; depois aplicar no SQL Editor");
}
console.log("\nURLs locais após seed:");
console.log("  SIGA login:     http://localhost:3006");
console.log("  Matrícula pub.: http://localhost:3006/matricula/dom-afonso-demo");
console.log("  ADMIN tenant:   http://localhost:3005/tenants (slug dom-afonso-demo)");
console.log("  Lookup API:     GET /api/saas/tenants/lookup?slug=dom-afonso-demo");
console.log("\nApós SEED_ESCOLA_DEMO_FULL.sql:");
console.log("  npm run siga:sync-demo-usage   # actualiza métricas no ADMIN /tenants");
console.log("\nNota: o tenant demo liga-se automaticamente se APPLY_SAAS_PLATFORM.sql já foi aplicado.");
