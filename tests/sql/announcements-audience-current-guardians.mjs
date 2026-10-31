// Ensaio local (PGlite) de 20261030010000_announcement_audience_current_guardians.sql.
// Sem produção. Executar:
// SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/announcements-audience-current-guardians.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE TABLE auth.whoami(uid uuid);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT uid FROM auth.whoami LIMIT 1 $$;
CREATE TABLE public.school_memberships(id uuid PRIMARY KEY, school_id uuid, user_id uuid, status text);
CREATE TABLE public.roles(id uuid PRIMARY KEY, school_id uuid, code text);
CREATE TABLE public.member_roles(school_id uuid, membership_id uuid, role_id uuid);
CREATE TABLE public.people(id uuid PRIMARY KEY, school_id uuid, user_id uuid);
-- Colunas de vigência como na produção (PRODUCTION_SNAPSHOT.json).
CREATE TABLE public.student_guardians(
  school_id uuid, student_id uuid, guardian_person_id uuid,
  valid_from date NOT NULL DEFAULT current_date, valid_until date
);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY, school_id uuid, student_id uuid);
CREATE TABLE public.finance_contracts(id uuid PRIMARY KEY, school_id uuid, enrollment_id uuid);
CREATE TABLE public.finance_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, contract_id uuid, status text, due_date date);
CREATE TABLE public.school_announcements(id serial PRIMARY KEY, school_id uuid, audience text, status text, deleted_at timestamptz);
ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION private.is_school_staff(p uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.school_memberships sm JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id WHERE sm.user_id = (SELECT auth.uid()) AND sm.school_id = p
    AND lower(r.code) IN ('admin','secretaria','teacher','professor','tesouraria')) $$;
GRANT USAGE ON SCHEMA private, auth TO authenticated;
GRANT SELECT ON public.school_announcements, auth.whoami TO authenticated;
`);
const read = (name) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
// Estado da produção primeiro (política e função de 03/10), depois a correcção.
await db.exec(read("20261003070000_announcements_audience_rls.sql"));

const S = "00000000-0000-0000-0000-00000000000a";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = { vigente: id(3), removido: id(4) };
await db.exec(`
INSERT INTO public.roles VALUES ('${id(13)}','${S}','encarregado');
INSERT INTO public.school_memberships VALUES
  ('${id(23)}','${S}','${users.vigente}','active'),('${id(24)}','${S}','${users.removido}','active');
INSERT INTO public.member_roles VALUES ('${S}','${id(23)}','${id(13)}'),('${S}','${id(24)}','${id(13)}');
INSERT INTO public.people VALUES ('${id(33)}','${S}','${users.vigente}'),('${id(34)}','${S}','${users.removido}');
-- Os dois foram encarregados do mesmo aluno, com factura vencida; o segundo foi removido.
INSERT INTO public.student_guardians(school_id, student_id, guardian_person_id, valid_from, valid_until) VALUES
  ('${S}','${id(41)}','${id(33)}', current_date - 300, null),
  ('${S}','${id(41)}','${id(34)}', current_date - 300, current_date - 5);
INSERT INTO public.enrollments VALUES ('${id(51)}','${S}','${id(41)}');
INSERT INTO public.finance_contracts VALUES ('${id(61)}','${S}','${id(51)}');
INSERT INTO public.finance_invoices(school_id, contract_id, status, due_date) VALUES
  ('${S}','${id(61)}','open', current_date - 10);
INSERT INTO public.school_announcements(school_id, audience, status) VALUES
  ('${S}','all_guardians','sent'),('${S}','guardians_with_debt','sent');
`);

const seen = async (uid) => {
  await db.exec(`DELETE FROM auth.whoami; INSERT INTO auth.whoami VALUES ('${uid}')`);
  await db.exec("SET ROLE authenticated");
  const { rows } = await db.query(
    "SELECT audience FROM public.school_announcements WHERE status = 'sent' ORDER BY id",
  );
  await db.exec("RESET ROLE");
  return rows.map((r) => r.audience);
};

// Antes da correcção: o encarregado removido ainda via a cobrança (o defeito).
assert.deepEqual(await seen(users.removido), ["all_guardians", "guardians_with_debt"]);

const migration = read("20261030010000_announcement_audience_current_guardians.sql");
await db.exec(migration);
await db.exec(migration);

assert.deepEqual(
  await seen(users.vigente),
  ["all_guardians", "guardians_with_debt"],
  "encarregado vigente com factura vencida continua a ver a cobrança",
);
assert.deepEqual(
  await seen(users.removido),
  ["all_guardians"],
  "encarregado removido deixa de ver a cobrança do antigo educando",
);

// Permissões: anon não executa; authenticated executa (a política usa-a).
const { rows: grants } = await db.query(`
  SELECT has_function_privilege('anon', 'private.announcement_audiences_for(uuid)', 'EXECUTE') AS anon,
         has_function_privilege('authenticated', 'private.announcement_audiences_for(uuid)', 'EXECUTE') AS auth
`);
assert.equal(grants[0].anon, false);
assert.equal(grants[0].auth, true);

console.log("announcements-audience-current-guardians: vigência, idempotência e permissões OK");
await db.close();
