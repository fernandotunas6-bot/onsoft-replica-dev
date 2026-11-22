#!/usr/bin/env node
/**
 * O esquema da produção cobre o código publicado? (análise 22, P0)
 *
 * A 12/11 entrou na `main` código que grava notas por três funções SQL que a produção
 * ainda não tinha. O CI estava verde porque compara o código com o retrato
 * (`supabase/PRODUCTION_SNAPSHOT.json`), e a lista de espera
 * (`tests/security/espera-migracao.ts`) existe precisamente para tolerar isso.
 *
 * Este passo corre depois da publicação, só lê (o índice OpenAPI do PostgREST,
 * `GET /rest/v1/`, com a chave de serviço) e não bloqueia: uma falha aqui não desfaz a
 * publicação nem a repete. Marca o run com um erro visível e escreve no resumo quais as
 * funções em falta e o pacote a aplicar. Nunca imprime a chave nem dados escolares.
 *
 *   node scripts/siga/check-schema-contract.mjs            (aviso; termina com 0)
 *   node scripts/siga/check-schema-contract.mjs --strict   (termina com 1 se faltar algo)
 */
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Funções da lista de espera (`FUNCOES_ESPERA_MIGRACAO`), lidas do ficheiro de testes. */
export function pendingFunctions(source) {
  const block = source.match(/FUNCOES_ESPERA_MIGRACAO\s*=\s*new Set<string>\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error("FUNCOES_ESPERA_MIGRACAO não encontrada em espera-migracao.ts");
  const withoutComments = block[1].replace(/\/\/[^\n]*/g, "");
  return [...withoutComments.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

/** Nomes das RPC que o PostgREST expõe a esta chave (caminhos `/rpc/<nome>`). */
export function exposedFunctions(openapi) {
  const paths = openapi && typeof openapi === "object" ? Object.keys(openapi.paths ?? {}) : [];
  return new Set(paths.filter((p) => p.startsWith("/rpc/")).map((p) => p.slice(5)));
}

function isJwt(key) {
  return key.split(".").length === 3;
}

export async function checkSchemaContract({ url, key, expected, fetchImpl = fetch }) {
  const headers = { apikey: key, Accept: "application/openapi+json" };
  // As chaves novas (`sb_secret_…`) não são JWT: vão só em `apikey`.
  if (isJwt(key)) headers.Authorization = `Bearer ${key}`;
  const response = await fetchImpl(`${url.replace(/\/+$/, "")}/rest/v1/`, { headers });
  if (!response.ok) return { ok: null, reason: `HTTP ${response.status}`, missing: [] };
  const exposed = exposedFunctions(await response.json());
  const missing = expected.filter((name) => !exposed.has(name));
  return { ok: missing.length === 0, missing };
}

function annotate(level, message) {
  console.log(`::${level} title=Esquema da produção::${message}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `### Esquema da produção\n\n${message}\n\n`);
}

async function main() {
  const strict = process.argv.includes("--strict");
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const expected = pendingFunctions(
    readFileSync(resolve(root, "tests/security/espera-migracao.ts"), "utf8"),
  );
  if (!expected.length) {
    console.log("Lista de espera vazia: nenhuma função por confirmar.");
    return 0;
  }
  if (!url || !key) {
    annotate("warning", "Sem SUPABASE_URL ou chave de serviço: esquema não verificado.");
    return 0;
  }
  let result;
  try {
    result = await checkSchemaContract({ url, key, expected });
  } catch (error) {
    annotate("warning", `Não foi possível ler o esquema (${error?.name ?? "erro"}).`);
    return 0;
  }
  if (result.ok === null) {
    annotate("warning", `O PostgREST recusou o índice (${result.reason}): esquema não verificado.`);
    return 0;
  }
  if (result.ok) {
    annotate(
      "notice",
      `As funções da lista de espera já existem na produção (${expected.join(", ")}): retirá-las de FUNCOES_ESPERA_MIGRACAO em tests/security/espera-migracao.ts e recapturar o retrato.`,
    );
    return 0;
  }
  annotate(
    "error",
    `O código publicado chama funções que a produção não tem: ${result.missing.join(", ")}. Aplicar no SQL Editor o pacote docs/agents/SIGA_aplicar_escrita_academica_2026-11-15.sql (ou o da migração respectiva) e confirmar com docs/agents/SIGA_confirmar_migracoes.sql.`,
  );
  return strict ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main();
}
