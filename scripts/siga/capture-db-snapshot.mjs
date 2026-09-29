#!/usr/bin/env node
/**
 * Retrato do esquema de produção — `npm run siga:db-snapshot`
 *
 * O esquema do SGA não está sob controlo de versões: parte vive em ficheiros
 * `APPLY_*.sql` colados à mão, e há tabelas e funções que só existem na base.
 * Enquanto isso não mudar, ninguém consegue rever uma alteração de esquema nem
 * reconstruir a produção a partir do repositório.
 *
 * Isto não é um `pg_dump` — não gera DDL e não serve para recriar nada. É um
 * inventário verificável: que tabelas existem, quais têm RLS, que políticas as
 * cobrem, que privilégios tem cada papel, que funções e triggers correm. O
 * suficiente para uma revisão humana notar uma diferença, e para um teste
 * comparar o que o repositório declara com o que a base faz.
 *
 * A distinção importa: um dump parcial gerado à mão parece autoritativo e não
 * é. Um inventário assumido como inventário é honesto e continua útil.
 *
 * Requer o CLI do Supabase ligado ao projecto (`supabase link`).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(root, "supabase/PRODUCTION_SNAPSHOT.json");

function query(sql) {
  const raw = execFileSync("npx", ["supabase", "db", "query", sql, "--linked"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const start = raw.indexOf("{");
  return JSON.parse(raw.slice(start)).rows ?? [];
}

const QUERIES = {
  resumo: `select json_build_object(
      'tabelas', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
      'com_rls', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
      'politicas', (select count(*) from pg_policies where schemaname='public'),
      'funcoes_private', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'),
      'triggers', (select count(*) from pg_trigger where not tgisinternal)
    ) as v`,

  tabelas: `select c.relname as tabela, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forcada,
      has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
      has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
      (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as politicas,
      -- As colunas entram no retrato porque um nome de coluna errado não é
      -- apanhado por nada: o caminho privilegiado não tem tipos e o PostgREST
      -- recusa o select inteiro, erro que quase sempre é tratado como «não há
      -- dados». Ver tests/security/colunas-inexistentes.test.ts.
      -- to_jsonb e nao array_agg: o CLI devolveria o literal de array do
      -- Postgres como string, e quem o lesse acabava com um conjunto de
      -- caracteres em vez de colunas.
      (select coalesce(to_jsonb(array_agg(a.attname order by a.attnum)), '[]'::jsonb)
         from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as colunas,
      -- Colunas que um insert TEM de enviar: NOT NULL, sem valor por omissão, sem
      -- identidade nem geradas. O Postgres verifica-as antes do ON CONFLICT, por
      -- isso um upsert sem elas falha mesmo quando a linha existe. Ver
      -- tests/security/colunas-obrigatorias.test.ts.
      (select coalesce(to_jsonb(array_agg(a.attname order by a.attnum)), '[]'::jsonb)
         from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          and a.attnotnull and not a.atthasdef and a.attidentity = '' and a.attgenerated = '') as obrigatorias
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by c.relname`,

  politicas: `select tablename as tabela, policyname as politica, cmd, roles::text as papeis,
      coalesce(qual,'') as usando, coalesce(with_check,'') as verificando
    from pg_policies where schemaname='public' order by tablename, policyname`,

  funcoes: `select n.nspname as schema, p.proname as funcao,
      pg_get_function_identity_arguments(p.oid) as args,
      p.prosecdef as security_definer
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('private','public') order by n.nspname, p.proname`,

  triggers: `select c.relname as tabela, t.tgname as trigger, p.proname as funcao, n.nspname as funcao_schema
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal order by c.relname, t.tgname`,

  // Chaves estrangeiras entre tabelas de `public`: são o que o PostgREST segue
  // num embed (`tabela(colunas)`). Um embed sem relação dá 400 e o select
  // inteiro falha. Ver tests/security/embeds-sem-relacao.test.ts.
  relacoes: `select c.conrelid::regclass::text as de, c.confrelid::regclass::text as para, c.conname as chave
    from pg_constraint c
    join pg_class a on a.oid=c.conrelid join pg_namespace na on na.oid=a.relnamespace
    join pg_class b on b.oid=c.confrelid join pg_namespace nb on nb.oid=b.relnamespace
    where c.contype='f' and na.nspname='public' and nb.nspname='public'
    order by 1, 2, 3`,
};

console.log("A consultar a produção (só leitura)…\n");
const snapshot = { capturadoEm: new Date().toISOString() };
for (const [nome, sql] of Object.entries(QUERIES)) {
  process.stdout.write(`  ${nome}… `);
  const rows = query(sql);
  snapshot[nome] = nome === "resumo" ? rows[0]?.v : rows;
  console.log(`${Array.isArray(snapshot[nome]) ? snapshot[nome].length : "ok"}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`\nEscrito: ${OUT.replace(root + "/", "")}`);
console.log(JSON.stringify(snapshot.resumo, null, 2));
