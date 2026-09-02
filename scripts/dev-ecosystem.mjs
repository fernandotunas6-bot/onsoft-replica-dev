#!/usr/bin/env node
/**
 * Arranca SIGA, WEB, ADMIN e DOC em paralelo (portas 3006, 5174, 3005, 5173).
 * Ctrl+C termina todos os processos filhos.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const apps = [
  { label: "SIGA", cwd: root, command: "npm", args: ["run", "dev"] },
  { label: "WEB", cwd: resolve(root, "painel/web"), command: "npm", args: ["run", "dev"] },
  { label: "ADMIN", cwd: resolve(root, "painel/admin"), command: "npm", args: ["run", "dev"] },
  { label: "DOC", cwd: resolve(root, "painel/docs"), command: "npm", args: ["run", "dev"] },
];

const children = [];

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

console.log("Ecossistema SIGA Plus — a arrancar 4 apps…");
console.log("  SIGA  → http://localhost:3006");
console.log("  WEB   → http://localhost:5174");
console.log("  ADMIN → http://localhost:3005/tenants");
console.log("  DOC   → http://localhost:5173");
console.log("Ctrl+C para parar todos.\n");

for (const app of apps) {
  const child = spawn(app.command, app.args, {
    cwd: app.cwd,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`[${app.label}] terminou com código ${code}`);
    }
  });
  children.push(child);
}
