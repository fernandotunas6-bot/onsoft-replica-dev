#!/usr/bin/env node
/**
 * Captura o DDL das tabelas que só existem em produção — `npm run siga:db-ddl`
 *
 * O retrato (`npm run siga:db-snapshot`) mede a divergência: quantas tabelas a
 * base tem que o repositório nunca declara. Este script fecha-a. Lê da base, em
 * modo só leitura, a definição real de cada tabela em falta — colunas, tipos,
 * omissões, chaves, restrições e índices — e escreve uma migração de captura.
 *
 * O que sai daqui é lido do catálogo do Postgres, não escrito à mão a partir do
 * TypeScript. É a diferença entre declarar o esquema e adivinhá-lo: um ficheiro
 * adivinhado passa a valer como referência e mente na primeira divergência.
 *
 * O ficheiro gerado é idempotente (`CREATE TABLE IF NOT EXISTS`, chaves
 * estrangeiras em blocos guardados, `CREATE INDEX IF NOT EXISTS`) e por isso
 * seguro de reaplicar num ambiente onde as tabelas já correm ao vivo. Serve
 * dois fins: reconstruir um ambiente novo a partir do repositório, e tornar
 * revisível qualquer alteração futura a estas tabelas.
 *
 * Requer o CLI do Supabase ligado ao projecto (`supabase link`).
 *
 * Uso:
 *   node scripts/siga/capture-table-ddl.mjs                 # tabelas em falta
 *   node scripts/siga/capture-table-ddl.mjs --tables=a,b    # lista explícita
 *   node scripts/siga/capture-table-ddl.mjs --out=caminho.sql
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const args = process.argv.slice(2);
const argValue = (nome) => {
  const hit = args.find((a) => a.startsWith(`--${nome}=`));
  return hit ? hit.slice(nome.length + 3) : null;
};

function query(sql) {
  const raw = execFileSync("npx", ["supabase", "db", "query", sql, "--linked"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const start = raw.indexOf("{");
  return JSON.parse(raw.slice(start)).rows ?? [];
}

/** O mesmo cálculo que `tests/security/production-snapshot.test.ts` faz. */
function tabelasDeclaradasNoRepo() {
  const files = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".sql")) files.push(full);
    }
  };
  walk(resolve(root, "supabase"));
  const combined = resolve(root, "all_migrations_combined.sql");
  if (existsSync(combined)) files.push(combined);
  const sql = files.map((f) => readFileSync(f, "utf8")).join("\n");
  return new Set(
    [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.(\w+)/gi)].map((m) =>
      m[1].toLowerCase(),
    ),
  );
}

const explicitas = argValue("tables");
let alvos;
if (explicitas) {
  alvos = explicitas
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
} else {
  const declaradas = tabelasDeclaradasNoRepo();
  const producao = query(
    `select c.relname as tabela from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' order by c.relname`,
  ).map((r) => r.tabela);
  alvos = producao.filter((t) => !declaradas.has(t.toLowerCase()));
}

if (alvos.length === 0) {
  console.log("Nada a capturar: todas as tabelas de produção já estão declaradas no repositório.");
  process.exit(0);
}

// Literal SQL a partir de identificadores vindos do próprio catálogo.
const lista = alvos.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");

console.log(`A ler a produção (só leitura) — ${alvos.length} tabelas…\n`);

const colunas = query(
  `select c.relname as tabela, a.attname as coluna, a.attnum as pos,
     format_type(a.atttypid, a.atttypmod) as tipo,
     a.attnotnull as nao_nulo,
     pg_get_expr(d.adbin, d.adrelid) as omissao,
     a.attidentity::text as identidade,
     a.attgenerated::text as gerada
   from pg_attribute a
   join pg_class c on c.oid = a.attrelid
   join pg_namespace n on n.oid = c.relnamespace
   left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where n.nspname='public' and c.relkind='r' and a.attnum > 0 and not a.attisdropped
     and c.relname in (${lista})
   order by c.relname, a.attnum`,
);

const restricoes = query(
  `select c.relname as tabela, con.conname as nome, con.contype::text as tipo,
     pg_get_constraintdef(con.oid) as definicao
   from pg_constraint con
   join pg_class c on c.oid = con.conrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname in (${lista})
   order by c.relname, con.contype, con.conname`,
);

const indices = query(
  `select c.relname as tabela, i.relname as indice, pg_get_indexdef(ix.indexrelid) as definicao
   from pg_index ix
   join pg_class c on c.oid = ix.indrelid
   join pg_class i on i.oid = ix.indexrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname in (${lista})
     and not exists (select 1 from pg_constraint con where con.conindid = ix.indexrelid)
   order by c.relname, i.relname`,
);

const rls = new Map(
  query(
    `select c.relname as tabela, c.relrowsecurity as rls
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname in (${lista})`,
  ).map((r) => [r.tabela, r.rls]),
);

const comentarios = new Map(
  query(
    `select c.relname as tabela, obj_description(c.oid, 'pg_class') as comentario
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname in (${lista}) and obj_description(c.oid,'pg_class') is not null`,
  ).map((r) => [r.tabela, r.comentario]),
);

const porTabela = (linhas) => {
  const mapa = new Map(alvos.map((t) => [t, []]));
  for (const linha of linhas) mapa.get(linha.tabela)?.push(linha);
  return mapa;
};

const colunasPor = porTabela(colunas);
const restricoesPor = porTabela(restricoes);
const indicesPor = porTabela(indices);

const aspas = (ident) => (/^[a-z_][a-z0-9_]*$/.test(ident) ? ident : `"${ident}"`);

function colunaSql(col) {
  const partes = [`  ${aspas(col.coluna)} ${col.tipo}`];
  if (col.gerada === "s") {
    partes.push(`GENERATED ALWAYS AS (${col.omissao}) STORED`);
  } else if (col.identidade === "a" || col.identidade === "d") {
    partes.push(`GENERATED ${col.identidade === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`);
  } else if (col.omissao) {
    partes.push(`DEFAULT ${col.omissao}`);
  }
  if (col.nao_nulo) partes.push("NOT NULL");
  return partes.join(" ");
}

const blocos = [];
let totalRestricoes = 0;
let totalIndices = 0;
const fksAdiadas = [];

for (const tabela of alvos) {
  const cols = colunasPor.get(tabela) ?? [];
  if (cols.length === 0) {
    console.warn(`  aviso: ${tabela} não tem colunas legíveis — ignorada`);
    continue;
  }
  const cons = restricoesPor.get(tabela) ?? [];
  // PK, UNIQUE e CHECK ficam em linha: só se aplicam na criação, e é aí que
  // importam. As FK ficam para o fim, num bloco guardado, para que a ordem das
  // tabelas dentro do ficheiro nunca possa partir uma reconstrução.
  const emLinha = cons.filter((c) => c.tipo !== "f");
  const fks = cons.filter((c) => c.tipo === "f");
  fksAdiadas.push(...fks.map((c) => ({ ...c, tabela })));
  totalRestricoes += cons.length;

  const corpo = [
    ...cols.map(colunaSql),
    ...emLinha.map((c) => `  CONSTRAINT ${aspas(c.nome)} ${c.definicao}`),
  ].join(",\n");

  const linhas = [];
  const comentario = comentarios.get(tabela);
  linhas.push(`-- ${tabela}${comentario ? ` — ${comentario.split("\n")[0]}` : ""}`);
  linhas.push(`CREATE TABLE IF NOT EXISTS public.${aspas(tabela)} (\n${corpo}\n);`);
  if (rls.get(tabela)) {
    linhas.push(`ALTER TABLE public.${aspas(tabela)} ENABLE ROW LEVEL SECURITY;`);
  }
  const idx = indicesPor.get(tabela) ?? [];
  totalIndices += idx.length;
  for (const i of idx) {
    // pg_get_indexdef devolve sempre CREATE [UNIQUE] INDEX <nome> ON …
    linhas.push(
      `${i.definicao.replace(/^CREATE (UNIQUE )?INDEX /, "CREATE $1INDEX IF NOT EXISTS ")};`,
    );
  }
  blocos.push(linhas.join("\n"));
}

const fkSql = fksAdiadas.map(
  (c) => `DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = '${c.nome.replace(/'/g, "''")}'
      AND conrelid = 'public.${c.tabela}'::regclass
  ) THEN
    ALTER TABLE public.${aspas(c.tabela)} ADD CONSTRAINT ${aspas(c.nome)} ${c.definicao};
  END IF;
END $$;`,
);

const capturadoEm = new Date().toISOString();
const carimbo = capturadoEm.replace(/[-:T]/g, "").slice(0, 14);
const out = resolve(
  root,
  argValue("out") ?? `supabase/migrations/${carimbo}_capture_undeclared_production_tables.sql`,
);

const cabecalho = `-- Migration: ${carimbo}_capture_undeclared_production_tables
-- Objetivo: Declarar em versionamento as ${blocos.length} tabelas que existiam na base ao
--   vivo sem nenhum CREATE TABLE no repositório — a divergência que
--   tests/security/production-snapshot.test.ts media e travava.
-- Metodologia: DDL lido do catálogo do Postgres (pg_attribute, pg_constraint,
--   pg_get_indexdef) por scripts/siga/capture-table-ddl.mjs, não escrito à mão.
--   100% idempotente: CREATE TABLE IF NOT EXISTS, chaves estrangeiras em blocos
--   guardados por pg_constraint, CREATE INDEX IF NOT EXISTS. Seguro de reaplicar
--   num ambiente onde estas tabelas já correm.
-- Âmbito: tabelas, restrições e índices. As políticas de RLS destas tabelas já
--   estão versionadas em supabase/HARDEN_*.sql e nas migrações de origem; aqui
--   só se liga o RLS onde a produção o tem ligado.
-- NUNCA executar via Lovable. Usar: npm run siga:sql (colar no SQL Editor do SGA)
-- Gerado em ${capturadoEm}

`;

const corpo = [
  "-- ═══════════════════════════════════════════════════════════════════════════",
  "-- 1. TABELAS, RESTRIÇÕES EM LINHA E ÍNDICES",
  "-- ═══════════════════════════════════════════════════════════════════════════",
  "",
  blocos.join("\n\n"),
  "",
  "-- ═══════════════════════════════════════════════════════════════════════════",
  "-- 2. CHAVES ESTRANGEIRAS (adiadas — independentes da ordem das tabelas)",
  "-- ═══════════════════════════════════════════════════════════════════════════",
  "",
  fkSql.join("\n\n"),
  "",
].join("\n");

writeFileSync(out, cabecalho + corpo);

console.log(`\nEscrito: ${out.replace(root + "/", "")}`);
console.log(
  JSON.stringify(
    {
      tabelas: blocos.length,
      colunas: colunas.length,
      restricoes: totalRestricoes,
      chaves_estrangeiras: fksAdiadas.length,
      indices: totalIndices,
    },
    null,
    2,
  ),
);
