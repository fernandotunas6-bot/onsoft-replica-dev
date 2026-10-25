#!/usr/bin/env node
/**
 * Pré-verificação sem rede, antes de instalar dependências para E2E @live.
 * Um workflow que salta testes por falta de secrets não é prova de homologação.
 * Credenciais nunca aparecem nas mensagens de erro.
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

export function assertStagingReady(env = process.env) {
  const missing = REQUIRED.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) {
    throw new Error(`Staging não configurado: faltam ${missing.join(", ")}. E2E não foi executado.`);
  }

  const projectRef = String(env.STAGING_SUPABASE_PROJECT_ID).trim();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error("Staging não configurado: project ref Supabase inválido.");
  }

  const url = String(env.STAGING_SUPABASE_URL).trim();
  const target = assertSafeE2ETarget({
    ...env,
    SIGA_E2E_ALLOW_WRITES: "1",
    SIGA_E2E_PROJECT_REF: projectRef,
    SUPABASE_PROJECT_ID: env.SUPABASE_PROJECT_ID || projectRef,
    SUPABASE_URL: env.SUPABASE_URL || url,
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || url,
  });

  // A URL que vai para o .env também precisa de passar pelo portão.
  assertSafeE2ETarget({
    SIGA_E2E_ALLOW_WRITES: "1",
    SIGA_E2E_PROJECT_REF: projectRef,
    SUPABASE_PROJECT_ID: projectRef,
    SUPABASE_URL: url,
  });
  if (target.projectRef !== projectRef) {
    throw new Error("Staging não configurado: o projecto de E2E diverge do esperado.");
  }
  return { projectRef };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertStagingReady();
    console.log("Staging: configuração estrutural válida; ainda requer validação remota e E2E real.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging não configurado.");
    process.exitCode = 1;
  }
}
