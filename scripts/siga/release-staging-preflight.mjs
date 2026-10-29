#!/usr/bin/env node
/**
 * Preflight fail-closed para a homologação autenticada do release.
 *
 * Não abre ligações nem escreve em bases de dados; verifica a configuração
 * do ambiente "staging" e invoca o mesmo guarda usado nos testes @live.
 * Nunca imprimir os valores de segredos.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeE2ETarget } from "./e2e-safety.mjs";

const REQUIRED = [
  "STAGING_SUPABASE_PROJECT_ID",
  "STAGING_SUPABASE_URL",
  "STAGING_SUPABASE_PUBLISHABLE_KEY",
  "STAGING_SUPABASE_SECRET_KEY",
];

export function checkReleaseStagingEnvironment(env) {
  const missing = REQUIRED.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) {
    throw new Error(`Staging incompleto: faltam ${missing.join(", ")}.`);
  }

  const projectRef = String(env.STAGING_SUPABASE_PROJECT_ID).trim();
  const url = String(env.STAGING_SUPABASE_URL).trim();

  // Só as variáveis verificadas chegam ao guarda: não aceitar fallback oculto
  // para .env local ou configuração de produção.
  return assertSafeE2ETarget({
    SIGA_E2E_ALLOW_WRITES: "1",
    SIGA_E2E_PROJECT_REF: projectRef,
    SUPABASE_PROJECT_ID: projectRef,
    SUPABASE_URL: url,
    VITE_SUPABASE_URL: url,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkReleaseStagingEnvironment(process.env);
    console.log("Staging isolado validado. Homologação autenticada autorizada.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
