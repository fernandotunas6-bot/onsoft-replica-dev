#!/usr/bin/env node
/**
 * Pipeline E2E @live (provisionamento real) — requer ecossistema a correr + Supabase.
 * Usado pelo job nocturno CI e localmente: SIGA_E2E_LIVE=1 npm run siga:e2e-live-only
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeE2ETarget } from "./e2e-safety.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
assertSafeE2ETarget();

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

let pipelineError = null;
try {
  await run("node", ["scripts/siga/e2e-ecosystem-smoke.mjs"], liveEnv);
  await run("npx", ["playwright", "install", "chromium"], liveEnv);
  await run("python3", ["scripts/siga/e2e-ecosystem-playwright.py"], liveEnv);
  await run("npm", ["run", "siga:e2e-playwright-live"], liveEnv);
} catch (error) {
  pipelineError = error;
}

// Auditoria sem escrita: executa mesmo quando o teste principal falha.
// Nunca converter um erro de limpeza ou de consulta num sucesso silencioso.
try {
  await run("node", ["scripts/siga/check-e2e-staging-residue.mjs"], liveEnv);
} catch (error) {
  pipelineError = pipelineError
    ? new AggregateError([pipelineError, error], "Falha E2E e resíduos de staging.")
    : error;
}

if (pipelineError) throw pipelineError;
console.log("E2E @live OK — staging sem resíduos.");
