// Ensaio local (PGlite) de 20261012120000_subjects_catalog_link.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/subjects-catalog-link.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261012120000_subjects_catalog_link.sql", import.meta.url),
  "utf8",
);

const db = new PGlite();
// A tabela como está na produção: já existe, com linhas.
await db.exec(`
CREATE TABLE public.subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  code text NOT NULL, name text NOT NULL);
INSERT INTO public.subjects (school_id, code, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'MAT', 'Matemática');
CREATE TABLE public.programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  code text NOT NULL, name text NOT NULL);
INSERT INTO public.programs (school_id, code, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'CFB', 'Ciências Físicas e Biológicas');
`);

await db.exec(migration);
await db.exec(migration);

const one = async (sql) => (await db.query(sql)).rows[0];

assert.equal(
  (await one(`SELECT count(*)::int AS n FROM public.subjects WHERE catalog_subject_code IS NULL`))
    .n,
  1,
  "as linhas existentes ficam por ligar",
);
assert.equal(
  (
    await one(
      `SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'subjects_catalog_subject_code_format'`,
    )
  ).n,
  1,
  "a restrição de formato existe uma só vez",
);

await db.exec(`UPDATE public.subjects SET catalog_subject_code = 'MAT'`);
await db.exec(`UPDATE public.subjects SET catalog_subject_code = 'SEC-CFB-2'`);
for (const bad of ["mat", "1MAT", "MAT A", "", "M".repeat(25)]) {
  await assert.rejects(
    db.query(`UPDATE public.subjects SET catalog_subject_code = $1`, [bad]),
    /subjects_catalog_subject_code_format/,
    `recusa «${bad}»`,
  );
}
await db.exec(`UPDATE public.subjects SET catalog_subject_code = NULL`);

assert.equal(
  (
    await one(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'subjects_school_catalog_code_idx'`,
    )
  ).n,
  1,
);

// Cursos: a mesma regra.
assert.equal(
  (await one(`SELECT count(*)::int AS n FROM public.programs WHERE catalog_course_code IS NULL`)).n,
  1,
);
await db.exec(`UPDATE public.programs SET catalog_course_code = 'SEC-CFB'`);
await assert.rejects(
  db.query(`UPDATE public.programs SET catalog_course_code = 'sec cfb'`),
  /programs_catalog_course_code_format/,
);
assert.equal(
  (
    await one(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'programs_school_catalog_code_idx'`,
    )
  ).n,
  1,
);

console.log("subjects-catalog-link: ok");
