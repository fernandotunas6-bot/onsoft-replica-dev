// Ensaio local (PGlite) de 20261010130000_early_enrollment.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/early-enrollment.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../../supabase/migrations/20261010130000_early_enrollment.sql");
const pacote = read("../../docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql");
assert.ok(pacote.includes(migration), "o pacote leva a migração tal e qual");

const db = new PGlite();
// Colunas e restrições como na produção (2026-10-10), só as que a função toca.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT '00000000-0000-0000-0000-0000000000ff'::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.has_permission(s uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE public.academic_years (id uuid PRIMARY KEY, school_id uuid NOT NULL, name text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','active','closed','archived')),
  starts_on date NOT NULL, ends_on date NOT NULL, CHECK (ends_on > starts_on));
CREATE TABLE public.class_groups (id uuid PRIMARY KEY, school_id uuid NOT NULL, academic_year_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active', capacity integer NOT NULL DEFAULT 40);
CREATE TABLE public.students (id uuid PRIMARY KEY, school_id uuid NOT NULL, status text NOT NULL,
  updated_by uuid, updated_at timestamptz);
CREATE TABLE public.enrollments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL, class_group_id uuid NOT NULL, student_id uuid NOT NULL,
  enrollment_number text NOT NULL CHECK (enrollment_number ~ '^MAT-[0-9]{6,}$'), enrolled_on date NOT NULL,
  status text NOT NULL DEFAULT 'active', created_by uuid, updated_by uuid);
CREATE UNIQUE INDEX enrollments_one_current_per_year_uidx ON public.enrollments (school_id, student_id, academic_year_id)
  WHERE status IN ('pending','active');
CREATE TABLE private.enrollment_number_sequences (school_id uuid PRIMARY KEY, next_number bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now());
`);

const S = "00000000-0000-0000-0000-00000000000a";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.query(
  `INSERT INTO public.academic_years VALUES
   ($1, $4, '2026/2027', 'active', '2026-09-01', '2027-07-31'),
   ($2, $4, '2027/2028', 'draft',  '2027-09-01', '2028-07-31'),
   ($3, $4, '2025/2026', 'closed', '2025-09-01', '2026-07-31')`,
  [id(1), id(2), id(3), S],
);
await db.query(
  "INSERT INTO public.class_groups (id, school_id, academic_year_id) VALUES ($1, $4, $5), ($2, $4, $6), ($3, $4, $7)",
  [id(11), id(12), id(13), S, id(1), id(2), id(3)],
);
for (let n = 100; n < 110; n += 1) {
  await db.query(
    "INSERT INTO public.students (id, school_id, status) VALUES ($1, $2, 'applicant')",
    [id(n), S],
  );
}
const enroll = async (student, group, on) =>
  (
    await db.query("SELECT private.enroll_student($1, $2, $3, $4::date) AS r", [
      S,
      id(student),
      id(group),
      on,
    ])
  ).rows[0].r;
const refused = (promise) =>
  assert.rejects(promise, (e) => /data de matrícula inválida/.test(String(e.message)));

await db.exec(migration);
await db.exec(migration);

// Ano activo, data dentro dele: grava a data pedida (como antes).
assert.equal((await enroll(100, 11, "2026-10-05")).enrolledOn, "2026-10-05");
// Ano em preparação, em Agosto: aceite, com a data de início do ano.
assert.equal((await enroll(101, 12, "2027-08-20")).enrolledOn, "2027-09-01");
// Renovação: o aluno do ano activo matricula-se também no seguinte.
assert.equal((await enroll(100, 12, "2027-06-15")).enrolledOn, "2027-09-01");
// Limites: 183 dias antes passa, 184 não; depois do fim não.
assert.equal((await enroll(102, 12, "2027-03-02")).enrolledOn, "2027-09-01");
await refused(enroll(103, 12, "2027-03-01"));
await refused(enroll(103, 12, "2028-08-01"));
// Ano fechado: recusado, mesmo com a data dentro dele.
await refused(enroll(104, 13, "2026-01-10"));
const { rows } = await db.query(
  "SELECT count(*)::int AS n FROM public.enrollments WHERE enrolled_on < (SELECT starts_on FROM public.academic_years y WHERE y.id = academic_year_id)",
);
assert.equal(rows[0].n, 0, "nenhuma matrícula fica com data antes do início do ano");

console.log(
  "early-enrollment: ano em preparação e datas até 183 dias antes aceites com a data de início; anos fechados e datas fora recusados; idempotente.",
);
