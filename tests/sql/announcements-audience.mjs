// Ensaio local (PGlite) de 20261003070000_announcements_audience_rls.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/announcements-audience.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

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
CREATE TABLE public.student_guardians(school_id uuid, student_id uuid, guardian_person_id uuid);
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
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261003070000_announcements_audience_rls.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);

const S = "00000000-0000-0000-0000-00000000000a";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = { prof: id(1), aluno: id(2), encDivida: id(3), encEmDia: id(4) };
await db.exec(`
INSERT INTO public.roles VALUES ('${id(11)}','${S}','professor'),('${id(12)}','${S}','aluno'),('${id(13)}','${S}','encarregado');
INSERT INTO public.school_memberships VALUES
  ('${id(21)}','${S}','${users.prof}','active'),('${id(22)}','${S}','${users.aluno}','active'),
  ('${id(23)}','${S}','${users.encDivida}','active'),('${id(24)}','${S}','${users.encEmDia}','active');
INSERT INTO public.member_roles VALUES ('${S}','${id(21)}','${id(11)}'),('${S}','${id(22)}','${id(12)}'),
  ('${S}','${id(23)}','${id(13)}'),('${S}','${id(24)}','${id(13)}');
INSERT INTO public.people VALUES ('${id(33)}','${S}','${users.encDivida}'),('${id(34)}','${S}','${users.encEmDia}');
INSERT INTO public.student_guardians VALUES ('${S}','${id(41)}','${id(33)}'),('${S}','${id(42)}','${id(34)}');
INSERT INTO public.enrollments VALUES ('${id(51)}','${S}','${id(41)}'),('${id(52)}','${S}','${id(42)}');
INSERT INTO public.finance_contracts VALUES ('${id(61)}','${S}','${id(51)}'),('${id(62)}','${S}','${id(52)}');
INSERT INTO public.finance_invoices(school_id, contract_id, status, due_date) VALUES
  ('${S}','${id(61)}','open', current_date - 10),
  ('${S}','${id(62)}','open', current_date + 10),
  ('${S}','${id(62)}','paid', current_date - 10);
INSERT INTO public.school_announcements(school_id, audience, status) VALUES
  ('${S}','all_guardians','sent'),('${S}','guardians_with_debt','sent'),('${S}','teaching_staff','sent'),
  ('${S}','students_finalists','sent'),('${S}','alumni_all','sent'),('${S}','all_guardians','draft');
`);

const seen = async (uid) => {
  await db.exec(`DELETE FROM auth.whoami; INSERT INTO auth.whoami VALUES ('${uid}')`);
  await db.exec("SET ROLE authenticated");
  const { rows } = await db.query(
    "SELECT audience || ':' || status AS a FROM public.school_announcements ORDER BY id",
  );
  await db.exec("RESET ROLE");
  return rows.map((r) => r.a);
};

assert.equal((await seen(users.prof)).length, 6, "pessoal vê tudo");
assert.deepEqual(await seen(users.aluno), ["all_guardians:sent", "students_finalists:sent"]);
assert.deepEqual(await seen(users.encDivida), ["all_guardians:sent", "guardians_with_debt:sent"]);
assert.deepEqual(
  await seen(users.encEmDia),
  ["all_guardians:sent"],
  "sem dívida vencida não vê a cobrança",
);
console.log("announcements-audience: OK");
