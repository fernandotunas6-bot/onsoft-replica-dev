#!/usr/bin/env node
/**
 * Playwright E2E do ecossistema (Fase 13).
 * Requer apps locais: npm run dev:ecosystem (ou portas 3006/5174/3005/5173).
 *
 * Ordem: smoke → Playwright TS (rotas/wizard) → Python UI → [@live] TS comercial/matrícula.
 * Provisionamento real: SIGA_E2E_LIVE=1 + SUPABASE_SECRET_KEY no .env.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function run(command, args, env = process.env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise(undefined);
      else reject(new Error(`${command} ${args.join(" ")} → exit ${code}`));
    });
  });
}

const live =
  process.env.SIGA_E2E_LIVE === "1" || process.env.SIGA_E2E_LIVE === "true";
const hasSecret = Boolean(process.env.SUPABASE_SECRET_KEY?.trim());
const pyEnv =
  live && hasSecret ? { ...process.env, SIGA_E2E_LIVE: "1" } : process.env;

await run("node", ["scripts/siga/e2e-ecosystem-smoke.mjs"]);

try {
  await run("npx", ["playwright", "install", "chromium"]);
  await run("npm", ["run", "siga:e2e-playwright-ts"]);
} catch (error) {
  if (process.env.SIGA_E2E_SKIP_UI === "1") {
    console.log("Playwright TS omitido (SIGA_E2E_SKIP_UI=1).");
  } else {
    throw error;
  }
}

try {
  await run("python3", ["scripts/siga/e2e-ecosystem-playwright.py"], pyEnv);
} catch (error) {
  if (process.env.SIGA_E2E_SKIP_UI === "1") {
    console.log("Playwright UI omitido (SIGA_E2E_SKIP_UI=1).");
  } else {
    throw error;
  }
}

if (live && hasSecret) {
  try {
    await run("npm", ["run", "siga:e2e-playwright-live"], {
      ...process.env,
      SIGA_E2E_LIVE: "1",
    });
  } finally {
    await run("node", ["scripts/siga/e2e-cleanup-stale.mjs"]).catch(() => undefined);
  }
} else if (live) {
  console.log("SIGA_E2E_LIVE=1 sem SUPABASE_SECRET_KEY — skip @live TypeScript.");
}
