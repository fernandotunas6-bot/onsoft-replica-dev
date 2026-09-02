#!/usr/bin/env node
/**
 * Pipeline E2E @live (provisionamento real) — requer ecossistema a correr + Supabase.
 * Usado pelo job nocturno CI e localmente: SIGA_E2E_LIVE=1 npm run siga:e2e-live-only
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

if (!process.env.SUPABASE_SECRET_KEY?.trim()) {
  console.error("❌ SUPABASE_SECRET_KEY em falta — @live requer Supabase configurado.");
  process.exit(1);
}

const liveEnv = { ...process.env, SIGA_E2E_LIVE: "1" };

await run("node", ["scripts/siga/e2e-ecosystem-smoke.mjs"], liveEnv);
await run("npx", ["playwright", "install", "chromium"]);
await run("python3", ["scripts/siga/e2e-ecosystem-playwright.py"], liveEnv);

try {
  await run("npm", ["run", "siga:e2e-playwright-live"], liveEnv);
} finally {
  await run("node", ["scripts/siga/e2e-cleanup-stale.mjs"]).catch(() => undefined);
}

console.log("E2E @live OK");
