// Ensaio local (PGlite) do pacote docs/agents/SIGA_aplicar_trabalhador_estudante.sql
// (migração 20261004150000). Sem produção.
// Uso: node tests/sql/higher-ed-statuses.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
// Só o que as chaves estrangeiras pedem, mais as tabelas que SIGA_confirmar_migracoes.sql
// pergunta (privilégios); papéis como no Supabase.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.schools (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.students (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL);
CREATE TABLE public.academic_years (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL);
CREATE TABLE public.siga_direct_messages (id uuid PRIMARY KEY);
CREATE TABLE public.student_academic_history (id uuid PRIMARY KEY);
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
`);

const pacote = read("../../docs/agents/SIGA_aplicar_trabalhador_estudante.sql");
const confirmar = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const estado = async () => Object.values((await db.query(confirmar)).rows[0])[0];
const sonda = async () =>
  (await db.exec(read("../../docs/agents/SIGA_confirmar_migracoes.sql")))
    .at(-1)
    .rows.find((r) => r.migracao === "20261004150000_higher_ed_student_statuses").estado;

assert.equal(await estado(), "por aplicar");
assert.equal(await sonda(), "EM FALTA");

for (let corrida = 0; corrida < 2; corrida++) {
  assert.deepEqual((await db.exec(pacote)).at(-1).rows[0], {
    "20261004150000 trabalhador-estudante": "aplicada",
  });
}
assert.equal(await sonda(), "aplicada");

// Só o servidor: anon e authenticated sem nada, mesmo com GRANT ALL ON ALL TABLES antes.
const priv = (role, p) =>
  db
    .query("select has_table_privilege($1, 'public.higher_ed_student_statuses', $2) as v", [
      role,
      p,
    ])
    .then((r) => r.rows[0].v);
for (const role of ["anon", "authenticated"]) {
  for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"])
    assert.equal(await priv(role, p), false, `${role} ${p}`);
}
assert.equal(await priv("service_role", "SELECT"), true);
const rls = (
  await db.query(
    "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.higher_ed_student_statuses'::regclass",
  )
).rows[0];
assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });

// Restrições: um estatuto por estudante, ano e tipo; comprovativo obrigatório; revogação completa.
const [school] = (await db.query("insert into schools default values returning id")).rows;
const [student] = (
  await db.query("insert into students(school_id) values($1) returning id", [school.id])
).rows;
const [year] = (
  await db.query("insert into academic_years(school_id) values($1) returning id", [school.id])
).rows;
const user = "00000000-0000-0000-0000-000000000001";
const grant = (
  evidence = "Declaração da empresa de 01/09/2026",
  status = "trabalhador_estudante",
) =>
  db.query(
    `insert into higher_ed_student_statuses(school_id, student_id, academic_year_id, status, evidence, granted_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [school.id, student.id, year.id, status, evidence, user],
  );
await grant();
await assert.rejects(grant(), /duplicate key|unique/);
await assert.rejects(grant("ok", "atleta"), /check constraint/);
await assert.rejects(
  db.query("update higher_ed_student_statuses set revoked_at = now()"),
  /check constraint/,
);
await db.query(
  "update higher_ed_student_statuses set revoked_at = now(), revoked_by = $1, revocation_reason = 'deixou de trabalhar'",
  [user],
);
await assert.rejects(
  db.query(
    `insert into higher_ed_student_statuses(school_id, student_id, academic_year_id, status, evidence, granted_by)
     values ($1, $2, $3, 'trabalhador_estudante', '  ', $4)`,
    [school.id, student.id, year.id, user],
  ),
  /check constraint|duplicate key/,
);

console.log(
  "trabalhador-estudante: pacote corre duas vezes; só o servidor acede; um estatuto por ano; comprovativo e revogação completos.",
);
