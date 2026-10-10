// Ensaio local (PGlite) de 20261010120000_global_education_catalog.sql e da
// carga supabase/seeds/education/catalog.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/education-catalog.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261010120000_global_education_catalog.sql");
const seed = read("supabase/seeds/education/catalog.sql");

const db = new PGlite();
// O que a migração usa e já existe na produção.
await db.exec(`
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public, private TO anon, authenticated, service_role;
CREATE TABLE public.schools (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE FUNCTION public.siga_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
INSERT INTO public.schools (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Escola A'),
  ('00000000-0000-0000-0000-000000000002', 'Escola B');
`);

// Migração e carga duas vezes: idempotentes.
await db.exec(migration);
await db.exec(migration);
await db.exec(seed);
const count = async (t) =>
  Number((await db.query(`SELECT count(*)::int AS n FROM public.${t}`)).rows[0].n);
const before = {};
for (const t of [
  "catalog_sources",
  "global_education_levels",
  "global_education_fields",
  "catalog_countries",
  "global_subject_catalog",
  "global_course_catalog",
  "country_education_stages",
  "country_curriculum_entries",
]) {
  before[t] = await count(t);
}
await db.exec(seed);
for (const [t, n] of Object.entries(before)) {
  assert.equal(await count(t), n, `${t} duplicou ao correr a carga outra vez`);
}
assert.equal(before.global_education_levels, 9);
assert.equal(
  Number(
    (
      await db.query(
        "SELECT count(*) AS n FROM public.global_education_fields WHERE broad_code IS NULL",
      )
    ).rows[0].n,
  ),
  12,
);
assert.ok(before.country_curriculum_entries > 300, "plano curricular carregado");

// Contexto de nível na base: Física não está no plano do primário angolano.
const fisicaPrimario = await db.query(`
  SELECT 1 FROM public.country_curriculum_entries WHERE stage_id = 'AO-EP' AND subject_code = 'FIS'`);
assert.equal(fisicaPrimario.rows.length, 0);
const fisica10 = await db.query(`
  SELECT 1 FROM public.country_curriculum_entries
  WHERE stage_id = 'AO-ESG2' AND course_code = 'SEC-CFB' AND grade = 10 AND subject_code = 'FIS'`);
assert.equal(fisica10.rows.length, 1);

// Integridade: código de disciplina desconhecido é recusado.
await assert.rejects(
  db.exec(`INSERT INTO public.country_curriculum_entries (stage_id, grade, subject_code, version, source_id, status)
           VALUES ('AO-EP', 1, 'NAOEXISTE', 'x', 'ao-inide-planos', 'in_review')`),
);
// Estado fora da lista é recusado.
await assert.rejects(
  db.exec(`UPDATE public.global_subject_catalog SET status = 'oficial' WHERE code = 'MAT'`),
);

// Permissões: authenticated só lê o catálogo; anon nada.
await db.exec("SET ROLE authenticated");
assert.ok((await db.query("SELECT count(*) FROM public.global_subject_catalog")).rows.length === 1);
await assert.rejects(
  db.exec(`UPDATE public.global_subject_catalog SET name = 'X' WHERE code = 'MAT'`),
);
await assert.rejects(
  db.exec(`INSERT INTO public.catalog_countries (code, name, locale, currency_code, grade_unit, admin_division)
                              VALUES ('XX', 'X', 'pt', 'XXX', 'ano', 'X')`),
);
await assert.rejects(db.query("SELECT * FROM public.identifier_sequences"));
await assert.rejects(
  db.query(
    "SELECT private.next_entity_identifier('00000000-0000-0000-0000-000000000001', 'teacher')",
  ),
);
await db.exec("RESET ROLE");
await db.exec("SET ROLE anon");
await assert.rejects(db.query("SELECT * FROM public.global_subject_catalog"));
await db.exec("RESET ROLE");

// Identificadores: sequência por escola e entidade, sem repetir.
await db.exec("SET ROLE service_role");
const next = async (school, entity) =>
  Number(
    (await db.query("SELECT private.next_entity_identifier($1, $2) AS n", [school, entity])).rows[0]
      .n,
  );
const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
assert.equal(await next(A, "teacher"), 1);
assert.equal(await next(A, "teacher"), 2);
assert.equal(await next(A, "room"), 1);
assert.equal(await next(B, "teacher"), 1);
const many = [];
for (let i = 0; i < 50; i += 1) many.push(await next(A, "class_group"));
assert.equal(new Set(many).size, 50);
await assert.rejects(next(A, "student"), "o aluno continua na sequência própria (EST-)");
await db.exec("RESET ROLE");

console.log("education-catalog: OK", before);
