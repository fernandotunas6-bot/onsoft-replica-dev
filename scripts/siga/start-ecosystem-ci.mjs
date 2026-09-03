#!/usr/bin/env node
/**
 * Arranca SIGA, WEB, ADMIN, DOC e PAYFLOW em background (CI / E2E).
 * Grava PIDs em .e2e-ecosystem-pids.json na raiz do repo.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pidFile = resolve(root, ".e2e-ecosystem-pids.json");

const apps = [
  { label: "SIGA", cwd: root, command: "npm", args: ["run", "dev"] },
  { label: "WEB", cwd: resolve(root, "painel/web"), command: "npm", args: ["run", "dev"] },
  { label: "ADMIN", cwd: resolve(root, "painel/admin"), command: "npm", args: ["run", "dev"] },
  { label: "DOC", cwd: resolve(root, "painel/docs"), command: "npm", args: ["run", "dev"] },\n  { label: "PAYFLOW", cwd: resolve(root, "painel/payflow"), command: "npm", args: ["run", "dev"] },
];

const pids = [];

for (const app of apps) {
  const child = spawn(app.command, app.args, {
    cwd: app.cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  if (child.pid) {
    pids.push({ label: app.label, pid: child.pid });
    console.log(`[${app.label}] pid ${child.pid}`);
  }
}

writeFileSync(pidFile, JSON.stringify(pids, null, 2));
console.log(`PIDs gravados em ${pidFile}`);
