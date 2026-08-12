#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(resolve(root, "scripts/siga/modules.json"), "utf8"));

let missing = 0;
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
    console.log(`✓ ${mod.id}  (${mod.skill})`);
  }
}

console.log(missing ? `\n${missing} ficheiro(s) em falta.` : "\nInventário completo.");
process.exit(missing ? 1 : 0);
