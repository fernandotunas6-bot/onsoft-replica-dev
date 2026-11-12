// A declaração de school_settings tem de produzir a forma que a produção tem.
//
// A forma abaixo foi lida do catálogo da produção a 2026-10-21, por consulta
// só-leitura a `pg_constraint`, `pg_indexes` e `information_schema.columns`.
// A primeira versão da migração foi escrita a partir do uso do código e
// divergia em oito pontos — a restrição de unicidade, a CHECK, a ordem das
// colunas, as omissões de `value` e `version`, a nulidade de `changed_by`, o
// índice, o ON DELETE CASCADE e três políticas que não existem na base.
//
// Uma divergência destas não dá erro: `CREATE TABLE IF NOT EXISTS` não altera
// uma tabela existente, por isso o ficheiro mente em silêncio e engana quem
// desenhar a partir dele. Foi o que aconteceu — ver docs/auditoria/
// website-escolar-unificacao-2026-10-21.md, secção 11.
//
// Não usa credenciais, dados ou projectos Supabase.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");

const CATALOGO = {
  colunas: "id, school_id, domain, version, value, changed_by, created_at",
  restricoes: {
    school_settings_pkey: "PRIMARY KEY (id)",
    school_settings_school_id_domain_version_key: "UNIQUE (school_id, domain, version)",
    school_settings_version_check: "CHECK ((version > 0))",
    school_settings_school_id_fkey: "FOREIGN KEY (school_id) REFERENCES schools(id)",
    school_settings_changed_by_fkey: "FOREIGN KEY (changed_by) REFERENCES auth.users(id)",
  },
  indices: [
    "school_settings_pkey",
    "school_settings_school_domain_idx",
    "school_settings_school_id_domain_version_key",
  ],
};

const db = new PGlite();
try {
  // Dependências fora do âmbito: só o suficiente para as chaves estrangeiras.
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.schools (id uuid PRIMARY KEY);
  `);
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20260908120000_school_settings_versioned.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  const { rows: colunas } = await db.query(
    `select string_agg(column_name, ', ' order by ordinal_position) as ordem
     from information_schema.columns where table_schema='public' and table_name='school_settings'`,
  );
  assert.equal(colunas[0].ordem, CATALOGO.colunas, "a ordem das colunas afastou-se do catálogo");

  const { rows: restricoes } = await db.query(
    `select conname, pg_get_constraintdef(oid) as def
     from pg_constraint where conrelid='public.school_settings'::regclass`,
  );
  const obtidas = Object.fromEntries(restricoes.map((r) => [r.conname, r.def]));
  assert.deepEqual(obtidas, CATALOGO.restricoes, "as restrições afastaram-se do catálogo");

  const { rows: indices } = await db.query(
    `select indexname from pg_indexes
     where schemaname='public' and tablename='school_settings' order by indexname`,
  );
  assert.deepEqual(
    indices.map((i) => i.indexname),
    CATALOGO.indices,
    "os índices afastaram-se do catálogo",
  );

  // As políticas da produção dependem de helpers que não existem neste ponto da
  // sequência: a migração não as declara, e não deve passar a declarar aqui.
  const { rows: politicas } = await db.query(
    `select polname from pg_policy where polrelid='public.school_settings'::regclass`,
  );
  assert.deepEqual(politicas, [], "esta migração não declara políticas");

  const { rows: rls } = await db.query(
    `select relrowsecurity as activa, relforcerowsecurity as forcada
     from pg_class where oid='public.school_settings'::regclass`,
  );
  assert.equal(rls[0].activa, true);
  assert.equal(rls[0].forcada, true);

  console.log("school-settings-matches-catalog: 7 colunas, 5 restrições, 3 índices OK");
} finally {
  await db.close();
}
