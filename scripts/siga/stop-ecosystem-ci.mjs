#!/usr/bin/env node
/**
 * Termina processos iniciados por start-ecosystem-ci.mjs.
 */
import { readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pidFile = resolve(root, ".e2e-ecosystem-pids.json");

try {
  const rows = JSON.parse(readFileSync(pidFile, "utf8"));
  for (const row of rows) {
    try {
      process.kill(row.pid, "SIGTERM");
      console.log(`[${row.label}] terminado pid ${row.pid}`);
    } catch {
      console.log(`[${row.label}] pid ${row.pid} já não existe`);
    }
  }
  unlinkSync(pidFile);
} catch {
  console.log("Nenhum ficheiro de PIDs do ecossistema.");
}
