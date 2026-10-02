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
      'triggers', (select count(*) from pg_trigger where not tgisinternal),
      'buckets', (select count(*) from storage.buckets),
      'buckets_publicos', (select count(*) from storage.buckets where public),
      'politicas_storage', (select count(*) from pg_policies where schemaname='storage')
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

  // `modo`: PERMISSIVE ou RESTRICTIVE. Uma restritiva só retira acesso (AND com as
  // permissivas); sem este campo, um teste lia-a como se concedesse escrita.
  politicas: `select tablename as tabela, policyname as politica, cmd, roles::text as papeis,
      coalesce(qual,'') as usando, coalesce(with_check,'') as verificando, permissive as modo
    from pg_policies where schemaname='public' order by tablename, policyname`,

  // O esquema `storage` ficou fora do retrato até 2026-09-28, e isso custou: o
  // ponto 5 da auditoria de segurança esteve dias sem se poder responder, porque
  // as políticas dos buckets não estavam em lado nenhum que se pudesse ler. As
  // leituras de ficheiros saem por URL assinada da chave de serviço e não
  // dependem destas políticas, mas as quatro escritas do browser (FileBrowser,
  // fotografia de pessoa, os dois envios de logótipo) dependem — e para essas a
  // política do bucket é a única fronteira que existe.
  // Entram como chaves próprias: `politicas` continua a ser só `public`, para não
  // mudar o que os catorze testes que lêem este ficheiro esperam encontrar.
  storage_buckets: `select id, public, file_size_limit, allowed_mime_types::text as tipos_aceites
    from storage.buckets order by id`,

  storage_politicas: `select tablename as tabela, policyname as politica, cmd, roles::text as papeis,
      coalesce(qual,'') as usando, coalesce(with_check,'') as verificando
    from pg_policies where schemaname='storage' order by tablename, policyname`,

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

  // Valores que um CHECK `coluna = ANY (ARRAY[...])` aceita. Um valor fora da lista
  // é recusado pela base (escrita) ou nunca encontra nada (filtro): era assim que a
  // anulação de matrículas gravava "withdrawn" e o login procurava domínios
  // "verified". Ver tests/security/valores-permitidos.test.ts.
  valores: `select t.relname as tabela, a.attname as coluna,
      to_jsonb(array(select m[1] from regexp_matches(pg_get_constraintdef(c.oid), '''([^'']*)''::text', 'g') as m order by 1)) as valores
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=t.oid and a.attnum = c.conkey[1]
    where n.nspname='public' and c.contype='c' and array_length(c.conkey, 1) = 1
      and pg_get_constraintdef(c.oid) ~ '= ANY \\(ARRAY\\['
    order by 1, 2`,
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
