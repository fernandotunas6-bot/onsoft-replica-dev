#!/usr/bin/env node
/**
 * Ajuda a aplicar o patch de lacunas do verify.
 * Uso: npm run siga:sql:patch
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const patch = resolve(root, "supabase/APPLY_MISSING_FROM_VERIFY.sql");
const catalog = JSON.parse(readFileSync(resolve(root, "scripts/siga/modules.json"), "utf8"));
const project = catalog.sgaRef || "xodgfmxiaunpamctfeea";
const dash = `https://supabase.com/dashboard/project/${project}/sql/new`;

if (!existsSync(patch)) {
  console.error("Ficheiro em falta:", patch);
  process.exit(1);
}

const sql = readFileSync(patch, "utf8");
console.log("═══════════════════════════════════════════════════════════");
console.log("  Patch SQL — lacunas do verify");
console.log("═══════════════════════════════════════════════════════════\n");
console.log(`Ficheiro: ${patch}`);
console.log(`Linhas:   ${sql.split("\n").length}`);
console.log(`Dashboard: ${dash}\n`);
console.log("Passos:");
console.log("  1. O SQL foi copiado para a área de transferência (se pbcopy existir)");
console.log("  2. Abre o SQL Editor (link acima), cola (Cmd+V) e Run");
console.log("  3. npm run siga:sql:verify\n");

const pb = spawnSync("pbcopy", [], { input: sql, encoding: "utf8" });
if (pb.error) {
  console.log("(pbcopy indisponível — abre o ficheiro e copia manualmente)");
} else {
  console.log("✓ Conteúdo em clipboard (pbcopy)");
}

spawnSync("open", [dash], { stdio: "ignore" });
