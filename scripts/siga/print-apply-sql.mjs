#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(resolve(root, "scripts/siga/modules.json"), "utf8"));

console.log("SGA SQL Editor — aplicar só estes, por esta ordem:\n");
for (const [index, file] of catalog.sqlApply.entries()) {
  console.log(`  ${index + 1}. ${file}`);
}
console.log("\nNunca aplicar ao SGA:");
for (const file of catalog.sqlNeverApplyToSga) console.log(`  - ${file}`);
console.log(`\nProjecto: ${catalog.sgaRef}`);
console.log("O segundo script cria current_school_id() via school_memberships.");
