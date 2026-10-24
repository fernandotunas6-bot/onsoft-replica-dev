// Ensaio local (PGlite) de 20261018110000_enrollment_public_server_only.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/enrollment-public-server-only.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
  "../../supabase/migrations/20261018110000_enrollment_public_server_only.sql",
);
const pacote = read("../../docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql");
assert.ok(pacote.includes(migration), "o pacote leva a migração tal e qual");

const db = new PGlite();
// Como na produção (leitura de 2026-10-18).
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.enrollment_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, slug text, is_open boolean,
  deleted_at timestamptz);
CREATE TABLE public.enrollment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, form_id uuid, full_name text,
  payload jsonb, status text DEFAULT 'pending', decided_at timestamptz, decided_by uuid,
  student_id uuid, deleted_at timestamptz);
ALTER TABLE public.enrollment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_applications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.enrollment_forms TO anon;
GRANT INSERT (school_id, form_id, full_name, payload, status) ON public.enrollment_applications TO anon;
GRANT ALL ON public.enrollment_forms, public.enrollment_applications TO service_role;
CREATE POLICY "Public read open enrollment forms" ON public.enrollment_forms FOR SELECT TO anon
  USING (is_open AND deleted_at IS NULL);
CREATE POLICY "Public insert open enrollment applications" ON public.enrollment_applications
  FOR INSERT TO anon WITH CHECK (status = 'pending' AND EXISTS (SELECT 1 FROM public.enrollment_forms f
    WHERE f.id = form_id AND f.school_id = enrollment_applications.school_id AND f.is_open));
INSERT INTO public.enrollment_forms (id, school_id, slug, is_open)
VALUES ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000001', 'x', true);
`);
const sonda = async () =>
  (await db.query(pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════")))).rows[0][
    "20261018110000 matrícula pública só no servidor"
  ];
const asAnon = async (sql) => {
  await db.exec("SET ROLE anon");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
};
const spam = `INSERT INTO public.enrollment_applications (school_id, form_id, full_name, payload, status)
  VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000f', 'x', '{}', 'pending')`;

// Antes: anon gravava candidaturas e lia os formulários directamente.
await asAnon(spam);
assert.equal((await asAnon("SELECT id FROM public.enrollment_forms")).rows.length, 1);
assert.equal(await sonda(), "por aplicar");

await db.exec(migration);
await db.exec(migration);
assert.equal(await sonda(), "aplicada");

await assert.rejects(asAnon(spam), /permission denied/);
await assert.rejects(asAnon("SELECT id FROM public.enrollment_forms"), /permission denied/);
// O servidor (chave de serviço) continua a gravar.
await db.exec("SET ROLE service_role");
await db.query(spam);
await db.exec("RESET ROLE");

console.log("enrollment-public-server-only: anon fora, servidor grava; idempotente.");
