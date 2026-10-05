// Ensaio local (PGlite) de 20261005030000_school_row_role_policies.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/school-row-role-policies.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const mig = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.school_memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL, user_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, code text NOT NULL);
CREATE TABLE public.member_roles (membership_id uuid NOT NULL, role_id uuid NOT NULL);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, cargo text);
CREATE TABLE public.schools (id uuid PRIMARY KEY, name text);
CREATE TABLE public.finance_gateway_webhook_events (id serial PRIMARY KEY, school_id uuid, amount numeric);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_gateway_webhook_events ENABLE ROW LEVEL SECURITY;
-- A política antiga, tal como estava na produção (versão simplificada do ramo do perfil).
CREATE FUNCTION public.current_profile_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT 'guardian'::text $$;
CREATE POLICY "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events
  FOR SELECT TO authenticated USING (
    school_id IN (SELECT sm.school_id FROM public.school_memberships sm WHERE sm.user_id = auth.uid() AND sm.status='active')
    AND (public.current_profile_role() = ANY (ARRAY['Administrador','Tesouraria','owner','admin','treasury','finance'])
      OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.cargo = ANY (ARRAY['Administrador','Tesouraria']))));
CREATE POLICY "Administrators can update their own school" ON public.schools FOR UPDATE TO authenticated
  USING (public.current_profile_role() = 'Administrador') WITH CHECK (public.current_profile_role() = 'Administrador');
CREATE POLICY schools_select_member ON public.schools FOR SELECT TO authenticated USING (true);
GRANT USAGE ON SCHEMA public, private, auth TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);
// Funções auxiliares reais (capturadas da produção: 20261004222220 e 20260930174857).
const helpers = mig("20261004222220_rls_set_based_school_access_20261004.sql");
await db.exec(
  helpers.slice(
    helpers.indexOf("CREATE OR REPLACE FUNCTION private.user_member_school_ids"),
    helpers.indexOf("CREATE OR REPLACE FUNCTION private.user_role_school_ids"),
  ),
);
await db.exec("GRANT EXECUTE ON FUNCTION private.user_member_school_ids() TO authenticated");
const ctx = mig("20260930174857_audit_atomic_workflows_and_school_context.sql");
const a = ctx.indexOf("CREATE OR REPLACE FUNCTION private.sga_app_role");
await db.exec(
  ctx.slice(a, ctx.indexOf("GRANT EXECUTE ON FUNCTION private.sga_app_role", a)) +
    "\nGRANT EXECUTE ON FUNCTION private.sga_app_role(uuid) TO authenticated;",
);

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const adminA = "00000000-0000-0000-0000-000000000001"; // Administrador em A, encarregado em B
const tesB = "00000000-0000-0000-0000-000000000002"; // Tesouraria em B
await db.exec(`
INSERT INTO schools VALUES ('${A}','A'),('${B}','B');
INSERT INTO profiles VALUES ('${adminA}','Administrador'),('${tesB}','Tesouraria');
INSERT INTO roles(id,school_id,code) VALUES ('00000000-0000-0000-0000-000000000a01','${A}','owner');
`);
await db.exec(`
INSERT INTO roles(id,school_id,code) VALUES ('00000000-0000-0000-0000-000000000b01','${B}','guardian'),('00000000-0000-0000-0000-000000000b02','${B}','treasury');
INSERT INTO school_memberships(id,school_id,user_id,status) VALUES
  ('00000000-0000-0000-0000-0000000000a1','${A}','${adminA}','active'),
  ('00000000-0000-0000-0000-0000000000b1','${B}','${adminA}','active'),
  ('00000000-0000-0000-0000-0000000000b2','${B}','${tesB}','active');
INSERT INTO member_roles VALUES
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000a01'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000b01'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000b02');
INSERT INTO finance_gateway_webhook_events(school_id,amount) VALUES ('${A}',100),('${B}',200);
`);

async function as(user, sql) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("SET ROLE authenticated");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
}
const seen = async (user) =>
  (await as(user, "select school_id from finance_gateway_webhook_events order by amount")).rows.map(
    (r) => r.school_id,
  );

// Antes: o cargo global deixa o Administrador de A ler os eventos de B, onde é só encarregado.
assert.deepEqual(await seen(adminA), [A, B]);

const fix = mig("20261005030000_school_row_role_policies.sql");
await db.exec(fix);
await db.exec(fix); // idempotente

// Depois: cada um vê só a escola onde tem o papel.
assert.deepEqual(await seen(adminA), [A]);
assert.deepEqual(await seen(tesB), [B]);
// A política de schools sai; sem política de UPDATE, a escrita directa não altera nada.
assert.equal((await as(adminA, `update schools set name='x' where id='${A}'`)).affectedRows, 0);
const left = await db.query(
  "select count(*)::int n from pg_policies where tablename='schools' and cmd='UPDATE'",
);
assert.equal(left.rows[0].n, 0);

console.log("school-row-role-policies: todas as verificações passaram");
