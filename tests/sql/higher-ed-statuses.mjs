// Ensaio local (PGlite) de 20261004140000_student_special_statuses.sql (trabalhador-estudante,
// aplicada na produção a 2026-10-04). Sem produção.
// Uso: node tests/sql/higher-ed-statuses.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
// Só o que as chaves estrangeiras e o trigger pedem, mais as tabelas que
// SIGA_confirmar_migracoes.sql pergunta (privilégios); papéis como no Supabase.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.schools (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.students (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL);
CREATE TABLE public.siga_direct_messages (id uuid PRIMARY KEY);
CREATE TABLE public.student_academic_history (id uuid PRIMARY KEY);
CREATE TABLE public.import_table_specs (table_schema text, table_name text, direct_import_policy text);
CREATE FUNCTION public.siga_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
`);

const migracao = read("../../supabase/migrations/20261004140000_student_special_statuses.sql");
const sonda = async () =>
  (await db.exec(read("../../docs/agents/SIGA_confirmar_migracoes.sql")))
    .at(-1)
    .rows.find((r) => r.migracao === "20261004140000_student_special_statuses").estado;

assert.equal(await sonda(), "EM FALTA");
await db.exec(migracao);
await db.exec(migracao); // idempotente
assert.equal(await sonda(), "aplicada");

// Só o servidor: anon e authenticated sem nada, mesmo com GRANT ALL ON ALL TABLES antes.
const priv = (role, p) =>
  db
    .query("select has_table_privilege($1, 'public.student_special_statuses', $2) as v", [role, p])
    .then((r) => r.rows[0].v);
for (const role of ["anon", "authenticated"]) {
  for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"])
    assert.equal(await priv(role, p), false, `${role} ${p}`);
}
assert.equal(await priv("service_role", "SELECT"), true);
const rls = (
  await db.query(
    "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.student_special_statuses'::regclass",
  )
).rows[0];
assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });

// Restrições: um estatuto em vigor por estudante e tipo; o revogado fica no histórico.
const [school] = (await db.query("insert into schools default values returning id")).rows;
const [student] = (
  await db.query("insert into students(school_id) values($1) returning id", [school.id])
).rows;
const user = "00000000-0000-0000-0000-000000000001";
await db.query("insert into auth.users values ($1)", [user]);
const grant = (extra = {}) =>
  db.query(
    `insert into student_special_statuses(school_id, student_id, kind, valid_from, valid_until, employer, evidence_note, granted_by)
     values ($1, $2, $3, $4, $5, $6, 'Declaração da empresa', $7)`,
    [
      school.id,
      student.id,
      extra.kind ?? "worker_student",
      extra.from ?? "2026-09-01",
      extra.until ?? "2027-07-31",
      extra.employer ?? null,
      user,
    ],
  );
await grant();
await assert.rejects(grant(), /duplicate key|unique/);
await assert.rejects(grant({ kind: "atleta" }), /check constraint/);
await assert.rejects(grant({ from: "2026-09-01", until: "2026-08-01" }), /check constraint/);
await assert.rejects(grant({ employer: "x".repeat(201) }), /check constraint/);
// Retirar (como o servidor faz) deixa a linha e liberta um novo estatuto.
await db.query(
  "update student_special_statuses set revoked_at = now(), revoked_by = $1, revoke_reason = 'deixou de trabalhar' where revoked_at is null",
  [user],
);
await grant({ from: "2027-09-01", until: "2028-07-31" });
const linhas = (
  await db.query(
    "select count(*)::int as total, count(*) filter (where revoked_at is null)::int as em_vigor from student_special_statuses",
  )
).rows[0];
assert.deepEqual(linhas, { total: 2, em_vigor: 1 });

console.log(
  "trabalhador-estudante: migração corre duas vezes; só o servidor acede; um estatuto em vigor; datas, tipo e revogação com histórico.",
);
