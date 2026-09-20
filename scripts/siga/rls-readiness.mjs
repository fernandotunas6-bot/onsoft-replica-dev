#!/usr/bin/env node
/**
 * Prontidão de RLS por tabela — `npm run siga:rls-readiness`
 *
 * O ARQ-01 é trocar `loadSgaAdminClient()` (service role, ignora RLS) por
 * `context.supabase` (leva o JWT, respeita RLS), domínio a domínio. O passo que
 * decide cada troca é sempre o mesmo: **as políticas na base permitem o que
 * este código faz?**
 *
 * Responder a isso por leitura do SQL versionado não funciona — o repositório
 * não descreve o esquema de produção (ver OPS-01). Este script pergunta à base:
 * para cada tabela que a aplicação usa com o cliente privilegiado, diz se o
 * papel `authenticated` consegue ler, inserir e actualizar. Uma tabela com RLS
 * activo e sem política é negação total: a migração dessa leitura devolveria
 * zero linhas, em silêncio e sem erro.
 *
 * Só lê — do Postgres e do código. Não altera nada.
 *
 * Requer o CLI do Supabase ligado ao projecto (`supabase link`).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const SQL = `
  with t as (
    select c.relname as tabela, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  p as (
    select tablename, cmd, roles::text as roles
    from pg_policies where schemaname = 'public'
  )
  select
    t.tabela,
    t.rls,
    count(p.cmd)                                                                  as politicas,
    bool_or(p.cmd in ('SELECT','ALL') and p.roles like '%authenticated%')          as le,
    bool_or(p.cmd in ('INSERT','ALL') and p.roles like '%authenticated%')          as insere,
    bool_or(p.cmd in ('UPDATE','ALL') and p.roles like '%authenticated%')          as actualiza,
    bool_or(p.cmd in ('DELETE','ALL') and p.roles like '%authenticated%')          as apaga
  from t left join p on p.tablename = t.tabela
  group by t.tabela, t.rls
  order by t.tabela
`;

function query(sql) {
  const raw = execFileSync("npx", ["supabase", "db", "query", sql, "--linked"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const start = raw.indexOf("{");
  if (start < 0) throw new Error(`resposta inesperada do CLI:\n${raw.slice(0, 400)}`);
  return JSON.parse(raw.slice(start)).rows ?? [];
}

/** Ficheiros que usam o cliente privilegiado, e as tabelas que cada um toca. */
function usoDoClientePrivilegiado() {
  const porFicheiro = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const code = readFileSync(full, "utf8");
      if (!code.includes("loadSgaAdminClient")) continue;
      const tabelas = new Set(
        [...code.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)].map((m) => m[1]),
      );
      if (tabelas.size > 0) porFicheiro.set(relative(root, full), [...tabelas].sort());
    }
  };
  walk(resolve(root, "src"));
  return porFicheiro;
}

let tabelas;
try {
  tabelas = query(SQL);
} catch (error) {
  console.error("Não foi possível consultar a base.");
  console.error(error instanceof Error ? error.message : error);
  console.error("\nO script precisa do CLI do Supabase ligado: `npx supabase link`.");
  process.exit(2);
}

const estado = new Map(tabelas.map((row) => [row.tabela, row]));
const uso = usoDoClientePrivilegiado();

/** Agrupa por módulo — é a unidade em que a migração do ARQ-01 acontece. */
const porModulo = new Map();
for (const [ficheiro, lista] of uso) {
  const modulo = ficheiro.split("/").slice(0, 3).join("/");
  const atual = porModulo.get(modulo) ?? { ficheiros: 0, tabelas: new Set() };
  atual.ficheiros += 1;
  for (const tabela of lista) atual.tabelas.add(tabela);
  porModulo.set(modulo, atual);
}

/**
 * Diz o que `authenticated` pode mesmo fazer, verbo a verbo.
 *
 * A granularidade importa: um módulo que faz `upsert` precisa de INSERT **e**
 * UPDATE, e um que apaga precisa de DELETE — e políticas de DELETE quase não
 * existem nesta base. Um rótulo "escreve" esconderia exactamente a diferença
 * que decide se a migração é segura.
 */
function classifica(tabela) {
  const row = estado.get(tabela);
  if (!row) return { marca: "?", nota: "não existe na produção" };
  if (!row.rls) return { marca: "—", nota: "sem RLS: a migração não muda nada" };
  if (Number(row.politicas) === 0) return { marca: "✗", nota: "RLS sem política: nega tudo" };
  if (!row.le) return { marca: "✗", nota: "sem política de leitura para authenticated" };

  const verbos = [
    ["lê", true],
    ["insere", row.insere],
    ["actualiza", row.actualiza],
    ["apaga", row.apaga],
  ];
  const pode = verbos.filter(([, ok]) => ok).map(([nome]) => nome);
  const nao = verbos.filter(([, ok]) => !ok).map(([nome]) => nome);
  const completa = nao.length === 0;
  return {
    marca: completa ? "✓" : "~",
    nota: completa ? "lê, insere, actualiza e apaga" : `${pode.join(", ")} — não ${nao.join(", ")}`,
  };
}

const BLOQUEADAS = new Set();
const PARCIAIS = new Set();

console.log("Prontidão para o ARQ-01 — pode este código passar a respeitar RLS?\n");

for (const modulo of [...porModulo.keys()].sort()) {
  const { ficheiros, tabelas: usadas } = porModulo.get(modulo);
  const linhas = [...usadas].sort().map((tabela) => ({ tabela, ...classifica(tabela) }));
  const bloqueadas = linhas.filter((l) => l.marca === "✗");
  const parciais = linhas.filter((l) => l.marca === "~");
  bloqueadas.forEach((l) => BLOQUEADAS.add(l.tabela));
  parciais.forEach((l) => PARCIAIS.add(l.tabela));

  const veredicto =
    bloqueadas.length > 0
      ? `BLOQUEADO — ${bloqueadas.length} tabela(s) sem leitura`
      : parciais.length > 0
        ? "LEITURAS SIM, ESCRITAS PARCIAIS"
        : "PRONTO";

  console.log(`${modulo}  (${ficheiros} ficheiro(s)) — ${veredicto}`);
  for (const linha of linhas) {
    console.log(`    ${linha.marca} ${linha.tabela.padEnd(34)} ${linha.nota}`);
  }
  console.log("");
}

console.log("Legenda: ✓ todos os verbos · ~ lê mas falta-lhe algum · ✗ nega leitura · — sem RLS\n");
console.log(`Tabelas que negam leitura a authenticated: ${BLOQUEADAS.size}`);
if (BLOQUEADAS.size > 0) console.log(`  ${[...BLOQUEADAS].sort().join(", ")}`);
console.log(`Tabelas legíveis a que falta algum verbo de escrita: ${PARCIAIS.size}`);
console.log(
  "\nUma tabela ✗ não é necessariamente um defeito — `school_integration_secrets` deve mesmo" +
    "\nnegar leitura a utilizadores. É a lista do que precisa de política antes de migrar.",
);
