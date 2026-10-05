// Ensaio local (PGlite) de 20261005020000_direct_writes_require_mfa.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/direct-writes-mfa.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
-- Cópia da função de produção.
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS
  $$ select coalesce((select auth.jwt()->>'aal') = 'aal2', false) $$;
CREATE TABLE public.tenants (id int PRIMARY KEY, name text);
CREATE TABLE public.siga_assessment_scores (id int PRIMARY KEY, score numeric);
CREATE TABLE public.profiles (id int PRIMARY KEY, name text); -- fora de âmbito
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_all ON public.tenants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY p_all ON public.siga_assessment_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY p_all ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA public, private, auth TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt(), private.is_aal2() TO authenticated, service_role;
INSERT INTO tenants VALUES (1,'a'); INSERT INTO siga_assessment_scores VALUES (1,10);
INSERT INTO profiles VALUES (1,'p');
`);
const mig = readFileSync(
  new URL(
    "../../supabase/migrations/20261005020000_direct_writes_require_mfa.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(mig);
await db.exec(mig); // idempotente; as tabelas em falta são saltadas sem erro

async function as(role, aal, sql) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ aal })]);
  await db.exec(`SET ROLE ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
}
const writes = (t, set) => [`update ${t} set ${set} where id=1`, `delete from ${t} where id=99`];

for (const [t, set, ins] of [
  ["tenants", "name='x'", "insert into tenants values (2,'n')"],
  ["siga_assessment_scores", "score=1", "insert into siga_assessment_scores values (2,5)"],
]) {
  // Sessão aal1: a leitura passa, a escrita directa não (insert, update e delete).
  assert.equal((await as("authenticated", "aal1", `select * from ${t}`)).rows.length, 1);
  await assert.rejects(as("authenticated", "aal1", ins), /row-level security/);
  assert.equal((await as("authenticated", "aal1", writes(t, set)[0])).affectedRows, 0);
  assert.equal((await as("authenticated", "aal1", `delete from ${t} where id=1`)).affectedRows, 0);
  // Sessão aal2: escreve.
  assert.equal((await as("authenticated", "aal2", writes(t, set)[0])).affectedRows, 1);
  assert.equal((await as("authenticated", "aal2", ins)).affectedRows, 1);
  assert.equal((await as("authenticated", "aal2", `delete from ${t} where id=2`)).affectedRows, 1);
  // service_role (o servidor) contorna a RLS e não é afectado, mesmo sem aal2.
  assert.equal((await as("service_role", "aal1", writes(t, set)[0])).affectedRows, 1);
}
// Fora de âmbito: profiles continua a aceitar escrita do utilizador sem 2FA.
assert.equal(
  (await as("authenticated", "aal1", "update profiles set name='q' where id=1")).affectedRows,
  1,
);
// Uma segunda aplicação não duplica políticas.
const n = await db.query(
  "select count(*)::int n from pg_policies where tablename='tenants' and permissive='RESTRICTIVE'",
);
assert.equal(n.rows[0].n, 3);

console.log("direct-writes-mfa: todas as verificações passaram");
