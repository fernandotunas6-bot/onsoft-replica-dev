// Ensaio local (PGlite) da migração 20261012100000_enrollment_cycle_guard.sql. Sem produção.
// Uso: node tests/sql/enrollment-cycle-guard.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
// Só as colunas que o gatilho usa (retrato da produção) e funções de autenticação simuladas.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE TABLE test_session (uid uuid, role text);
INSERT INTO test_session VALUES (null, null);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ select uid from public.test_session $$;
CREATE FUNCTION public.is_school_member(uuid) RETURNS boolean LANGUAGE sql
  AS $$ select uid is not null from public.test_session $$;
CREATE FUNCTION private.sga_app_role(uuid) RETURNS text LANGUAGE sql
  AS $$ select role from public.test_session $$;
CREATE TABLE public.terms (school_id uuid, academic_year_id uuid, starts_on date, ends_on date);
CREATE TABLE public.school_settings (school_id uuid, domain text, value jsonb);
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL, academic_year_id uuid NOT NULL, student_id uuid NOT NULL
);
`);

const migration = readFileSync(
  new URL("../../supabase/migrations/20261012100000_enrollment_cycle_guard.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(migration); // idempotente

const school = "11111111-1111-4111-8111-111111111111";
const year = "22222222-2222-4222-8222-222222222222";
const as = (uid, role) => db.query("update test_session set uid = $1, role = $2", [uid, role]);
const enroll = () =>
  db.query(
    "insert into enrollments(school_id, academic_year_id, student_id) values ($1,$2,gen_random_uuid())",
    [school, year],
  );
const refused = async () => {
  await assert.rejects(enroll, /Fora do período de matrículas/);
};
const user = "33333333-3333-4333-8333-333333333333";

// Sem períodos nem ciclos: aberto.
await as(user, "Secretaria");
await enroll();

// Hoje dentro de um período de aulas: a Secretaria é recusada; Administração e serviço passam.
await db.query("insert into terms values ($1,$2,current_date - 10, current_date + 10)", [
  school,
  year,
]);
await refused();
await as(user, "Administrador");
await enroll();
await as(null, null);
await enroll();

// Sem aulas hoje, mas com ciclos: só dentro de um ciclo.
await db.query("delete from terms");
await as(user, "Secretaria");
await db.query(
  `insert into school_settings values ($1,'enrollment', jsonb_build_object('cycles', jsonb_build_array(
     jsonb_build_object('label','Passado','opens_on', (current_date - 30)::text, 'closes_on', (current_date - 20)::text))))`,
  [school],
);
await refused();
await db.query(
  `update school_settings set value = jsonb_build_object('cycles', jsonb_build_array(
     jsonb_build_object('label','Agora','opens_on', (current_date - 1)::text, 'closes_on', (current_date + 1)::text)))`,
);
await enroll();

// Ciclos estragados são ignorados (como no código): sem ciclos válidos fica aberto.
await db.query(`update school_settings set value = '{"cycles":[{"opens_on":"ontem"}]}'`);
await enroll();

// Mudar uma matrícula (UPDATE) nunca passa pelo gatilho.
await db.query("insert into terms values ($1,$2,current_date - 1, current_date + 1)", [
  school,
  year,
]);
await db.query("update enrollments set student_id = student_id");

console.log("enrollment-cycle-guard: idempotente, aulas, ciclos, Administração e serviço ok");
