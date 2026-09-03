#!/usr/bin/env node
/**
 * Static audit for every versioned Supabase migration.
 *
 * This does not replace pgTAP or live SGA verification. It catches drift that
 * can be detected from source: exposed tables without RLS in their migration,
 * deprecated auth.role(), unsafe SECURITY DEFINER search_path omissions and
 * broad FOR ALL authenticated policies.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = resolve(root, "supabase/migrations");
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();

const findings = [];
let tableCount = 0;
let functionCount = 0;

for (const file of files) {
  const sql = readFileSync(resolve(dir, file), "utf8");
  const tables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi)]
    .map((match) => match[1]);
  const rlsTables = new Set(
    [...sql.matchAll(/alter\s+table\s+(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)]
      .map((match) => match[1]),
  );
  const functions = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([^\s(]+)/gi)]
    .map((match) => match[1]);

  tableCount += tables.length;
  functionCount += functions.length;

  const missingRls = tables.filter((table) => !rlsTables.has(table));
  const deprecatedAuthRole = (sql.match(/auth\.role\s*\(/gi) ?? []).length;
  const broadPolicies = (sql.match(/for\s+all\s+to\s+authenticated/gi) ?? []).length;

  const definerBlocks = sql
    .split(/create\s+(?:or\s+replace\s+)?function/gi)
    .slice(1)
    .filter((block) => /security\s+definer/i.test(block));
  const unsafeDefiners = definerBlocks.filter(
    (block) => !/set\s+search_path\s*=\s*(?:''|pg_catalog\s*,\s*public|public\s*,\s*pg_catalog)/i.test(block),
  ).length;

  if (missingRls.length || deprecatedAuthRole || unsafeDefiners || broadPolicies) {
    findings.push({
      file,
      missingRls,
      deprecatedAuthRole,
      unsafeDefiners,
      broadPolicies,
    });
  }
}

console.log("SIGA migration static audit");
console.log("  files:", files.length);
console.log("  CREATE TABLE:", tableCount);
console.log("  CREATE FUNCTION:", functionCount);
console.log("");

let failed = false;
for (const finding of findings) {
  console.log(finding.file);
  if (finding.missingRls.length) {
    console.log("  ERROR tables without RLS in same migration:", finding.missingRls.join(", "));
    failed = true;
  }
  if (finding.deprecatedAuthRole) {
    console.log("  ERROR deprecated auth.role():", finding.deprecatedAuthRole);
    failed = true;
  }
  if (finding.unsafeDefiners) {
    console.log("  ERROR SECURITY DEFINER without explicit safe search_path:", finding.unsafeDefiners);
    failed = true;
  }
  if (finding.broadPolicies) {
    console.log("  REVIEW broad FOR ALL TO authenticated policies:", finding.broadPolicies);
  }
}

const payflowMigration = files.find((file) => file.endsWith("_payflow_orchestration.sql"));
if (!payflowMigration) {
  console.error("\nERROR: versioned PayFlow migration not found.");
  failed = true;
}
if (!files.includes("20260903050000_guard_pedagogy_term_locks.sql")) {
  console.error("\nERROR: expected latest academic guard migration is missing.");
  failed = true;
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("\n✓ Static migration safety checks passed.");
  console.log("  Broad historical policies are review-only because SGA uses canonical APPLY scripts.");
}
