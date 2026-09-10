#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(resolve(root, "scripts/siga/modules.json"), "utf8"));

const navInfra = [
  "src/features/auth/navigation-catalog.ts",
  "src/features/auth/portal-engine.ts",
  "src/features/auth/route-inventory.ts",
  "src/features/integrations/launcher-types.ts",
  "tests/auth/navigation-catalog.test.ts",
];

let missing = 0;

for (const file of navInfra) {
  if (!existsSync(resolve(root, file))) {
    missing += 1;
    console.log(`✗ nav infra missing ${file}`);
  }
}

for (const mod of catalog.modules) {
  const files = [...(mod.routes ?? []), ...(mod.feature ?? []), ...(mod.tests ?? [])];
  const absent = files.filter((file) => !existsSync(resolve(root, file)));
  const skill = `.cursor/skills/${mod.skill}/SKILL.md`;
  if (!existsSync(resolve(root, skill))) absent.push(skill);
  if (absent.length) {
    missing += absent.length;
    console.log(`✗ ${mod.id}`);
    for (const file of absent) console.log(`    missing ${file}`);
  } else {
    const navHint = mod.navPath
      ? ` → ${mod.navPath}`
      : mod.publicPath
        ? ` (public ${mod.publicPath})`
        : "";
    console.log(`✓ ${mod.id}  (${mod.skill})${navHint}`);
  }
}

console.log(
  missing
    ? `\n${missing} ficheiro(s) em falta. Correr também: npm run siga:check-nav`
    : "\nInventário completo. Correr: npm run siga:check-nav",
);
process.exit(missing ? 1 : 0);
