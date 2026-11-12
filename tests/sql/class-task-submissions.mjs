// Ensaio local (PGlite) de 20261025140000_class_task_submissions.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/class-task-submissions.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261025140000_class_task_submissions.sql", import.meta.url),
  "utf8",
);

const school = "00000000-0000-0000-0000-00000000000a";
const enrollment = "00000000-0000-0000-0000-0000000000e1";
const task = "00000000-0000-0000-0000-0000000000f1";

const db = new PGlite();
// O que a migração encontra na produção (colunas do retrato, só as precisas).
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION public.siga_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at := now() + interval '1 second'; RETURN NEW; END $$;
CREATE TABLE public.schools (id uuid PRIMARY KEY);
CREATE TABLE public.enrollments (id uuid PRIMARY KEY, school_id uuid);
CREATE TABLE public.siga_files (id uuid PRIMARY KEY);
CREATE TABLE public.siga_assessment_items (id uuid PRIMARY KEY);
CREATE TABLE public.siga_class_tasks (
  id uuid PRIMARY KEY, school_id uuid, title text, due_on date, status text);
INSERT INTO public.schools VALUES ('${school}');
INSERT INTO public.enrollments VALUES ('${enrollment}', '${school}');
INSERT INTO public.siga_class_tasks VALUES ('${task}', '${school}', 'Resumo', '2026-11-01', 'published');
`);

await db.exec(migration);
await db.exec(migration);

const as = async (role, sql) => {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
};
const insert = (attempt) =>
  `INSERT INTO public.siga_class_task_submissions
     (school_id, task_id, enrollment_id, attempt, submitted_at, body)
   VALUES ('${school}', '${task}', '${enrollment}', ${attempt}, now(), 'texto')`;

// Trabalhos de menores: o browser não lê nem escreve.
for (const role of ["anon", "authenticated"]) {
  await assert.rejects(
    as(role, "SELECT * FROM public.siga_class_task_submissions"),
    /permission denied/,
  );
  await assert.rejects(as(role, insert(1)), /permission denied/);
}

// O servidor (service_role) entrega, e reenviar é uma tentativa nova.
await as("service_role", insert(1));
await as("service_role", insert(2));
await assert.rejects(as("service_role", insert(2)), /siga_class_task_submissions_attempt_key/);
await assert.rejects(as("service_role", insert(21)), /check/i);

// Devolvida sem data de devolução, ou entregue sem data de entrega: recusado.
await assert.rejects(
  as(
    "service_role",
    `UPDATE public.siga_class_task_submissions SET status = 'returned' WHERE attempt = 1`,
  ),
  /siga_class_task_submissions_returned_check/,
);
await assert.rejects(
  as(
    "service_role",
    `INSERT INTO public.siga_class_task_submissions (school_id, task_id, enrollment_id, attempt, status)
     VALUES ('${school}', '${task}', '${enrollment}', 3, 'submitted')`,
  ),
  /siga_class_task_submissions_submitted_check/,
);

// Devolver com nota toca o updated_at (trigger).
const before = (
  await db.query("SELECT updated_at FROM public.siga_class_task_submissions WHERE attempt = 1")
).rows[0].updated_at;
await as(
  "service_role",
  `UPDATE public.siga_class_task_submissions
     SET status = 'returned', returned_at = now(), grade = 14, feedback = 'Bom'
   WHERE attempt = 1`,
);
const after = (
  await db.query("SELECT updated_at FROM public.siga_class_task_submissions WHERE attempt = 1")
).rows[0].updated_at;
assert.ok(after > before, "o trigger actualiza o updated_at");

// Opções novas da tarefa, com omissão segura para as tarefas que já existem.
const taskRow = (
  await db.query("SELECT accepts_late, assessment_item_id FROM public.siga_class_tasks")
).rows[0];
assert.deepEqual(taskRow, { accepts_late: true, assessment_item_id: null });

// Apagar a matrícula leva as entregas; RLS forçado na tabela.
const rls = (
  await db.query(
    "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'siga_class_task_submissions'",
  )
).rows[0];
assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
await db.exec(`DELETE FROM public.enrollments WHERE id = '${enrollment}'`);
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM public.siga_class_task_submissions")).rows[0].n,
  0,
);

console.log("class-task-submissions: só o servidor; tentativas únicas; idempotente.");
