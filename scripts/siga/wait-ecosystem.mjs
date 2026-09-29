#!/usr/bin/env node
/**
 * Aguarda as apps do ecossistema (SIGA 3006, PAYFLOW 3007, WEB 5174, ADMIN 3005,
 * DOC 5173).
 *
 * Com `.e2e-ecosystem-pids.json` (escrito por start-ecosystem-ci.mjs) só espera pelas
 * apps que esse script arrancou: o CI não arranca o PayFlow (o smoke trata-o como
 * opcional) e esta espera ficava 4 minutos à porta 3007 até falhar.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pidFile = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
  ".e2e-ecosystem-pids.json",
);
const started = existsSync(pidFile)
  ? new Set(JSON.parse(readFileSync(pidFile, "utf8")).map((row) => row.label))
  : null;

const allTargets = [
  { label: "SIGA", url: "http://localhost:3006/", ok: [200, 302] },
  { label: "PAYFLOW", url: "http://localhost:3007/", ok: [200, 302, 307] },
  { label: "WEB", url: "http://localhost:5174/", ok: [200] },
  { label: "ADMIN", url: "http://localhost:3005/", ok: [200, 307] },
  { label: "DOC", url: "http://localhost:5173/", ok: [200] },
];

const targets = started ? allTargets.filter((target) => started.has(target.label)) : allTargets;

const maxAttempts = Number(process.env.SIGA_E2E_WAIT_ATTEMPTS || 90);
const delayMs = Number(process.env.SIGA_E2E_WAIT_DELAY_MS || 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(target) {
  try {
    const res = await fetch(target.url, { redirect: "manual" });
    return target.ok.includes(res.status);
  } catch {
    return false;
  }
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const results = await Promise.all(
    targets.map(async (target) => ({ target, ready: await probe(target) })),
  );
  const pending = results.filter((row) => !row.ready).map((row) => row.target.label);
  if (pending.length === 0) {
    console.log(`Ecossistema pronto (${targets.map((t) => t.label).join(", ")}).`);
    process.exit(0);
  }
  console.log(`[${attempt}/${maxAttempts}] A aguardar: ${pending.join(", ")}`);
  await sleep(delayMs);
}

console.error("Timeout — apps não responderam a tempo.");
process.exit(1);
