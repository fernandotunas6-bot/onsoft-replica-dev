import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_REF = "xodgfmxiaunpamctfeea";
const root = fileURLToPath(new URL("../../", import.meta.url));

export function readE2EEnvironment(env = process.env) {
  const merged = {};
  const file = resolve(root, ".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) merged[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return { ...merged, ...env };
}

/** Recusar antes de qualquer escrita, inclusive cleanup e pedidos HTTP de signup. */
export function assertSafeE2ETarget(env = readE2EEnvironment()) {
  if (env.SIGA_E2E_ALLOW_WRITES !== "1") {
    throw new Error(
      "E2E com escrita bloqueado: defina SIGA_E2E_ALLOW_WRITES=1 apenas num ambiente isolado.",
    );
  }
  const expected = String(env.SIGA_E2E_PROJECT_REF ?? "").trim();
  if (!expected || expected === PRODUCTION_REF) {
    throw new Error(
      "E2E com escrita bloqueado: indique um projecto de staging; produção nunca é permitida.",
    );
  }
  const keys = ["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];
  const values = keys.map((key) => env[key]).filter(Boolean);
  if (!values.length) throw new Error("E2E com escrita bloqueado: URL Supabase em falta.");
  for (const value of values) {
    let url;
    try {
      url = new URL(String(value));
    } catch {
      throw new Error("E2E com escrita bloqueado: URL Supabase inválido.");
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const reference = local ? "local" : /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1];
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !reference ||
      reference === PRODUCTION_REF ||
      reference !== expected
    ) {
      throw new Error("E2E com escrita bloqueado: projecto inesperado, misto ou de produção.");
    }
  }
  if (env.SUPABASE_PROJECT_ID && env.SUPABASE_PROJECT_ID !== expected) {
    throw new Error(
      "E2E com escrita bloqueado: Management API e Supabase apontam para projectos distintos.",
    );
  }
  // Um backend remoto pode usar uma base diferente da declarada neste processo.
  for (const key of ["VITE_SIGA_URL", "VITE_WEB_URL", "VITE_ADMIN_URL", "VITE_PAYFLOW_URL"]) {
    if (!env[key]) continue;
    let url;
    try {
      url = new URL(env[key]);
    } catch {
      throw new Error("E2E com escrita bloqueado: origem da aplicação inválida.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      throw new Error(
        "E2E com escrita bloqueado: executar apenas contra aplicações locais ligadas ao staging confirmado.",
      );
    }
  }
  return { projectRef: expected };
}

/**
 * Limpar restos de E2E **na** produção é o inverso de correr E2E **contra** a produção, e
 * `assertSafeE2ETarget` recusa a segunda — recusava também a primeira, e por isso a limpeza
 * não tinha como correr: o dry-run passava (salta esta verificação) e a execução real falhava
 * em todos os tenants.
 *
 * Fora da produção, valem as regras estritas do E2E. Na produção exige-se um opt-in próprio,
 * `SIGA_CLEANUP_ALLOW_PRODUCTION=1`, e nada mais é afrouxado: quem chama já restringiu o alvo
 * ao padrão de slug E2E e ao domínio `@siga-plus.test`.
 */
export function assertSafeCleanupTarget(env = readE2EEnvironment()) {
  const keys = ["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];
  const values = keys.map((key) => env[key]).filter(Boolean);
  if (!values.length) throw new Error("Limpeza bloqueada: URL Supabase em falta.");

  const refs = new Set();
  for (const value of values) {
    let url;
    try {
      url = new URL(String(value));
    } catch {
      throw new Error("Limpeza bloqueada: URL Supabase inválido.");
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const reference = local ? "local" : /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1];
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !reference) {
      throw new Error("Limpeza bloqueada: URL Supabase inesperado.");
    }
    refs.add(reference);
  }
  if (refs.size > 1)
    throw new Error("Limpeza bloqueada: variáveis a apontar para projectos distintos.");

  const [reference] = [...refs];
  if (reference !== PRODUCTION_REF) return assertSafeE2ETarget(env);

  if (env.SIGA_CLEANUP_ALLOW_PRODUCTION !== "1") {
    throw new Error(
      "Limpeza bloqueada: para remover restos de E2E da produção defina SIGA_CLEANUP_ALLOW_PRODUCTION=1.",
    );
  }
  if (env.SUPABASE_PROJECT_ID && env.SUPABASE_PROJECT_ID !== PRODUCTION_REF) {
    throw new Error(
      "Limpeza bloqueada: Management API e Supabase apontam para projectos distintos.",
    );
  }
  return { projectRef: PRODUCTION_REF, production: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertSafeE2ETarget();
    console.log("E2E: destino isolado confirmado; produção recusada.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
