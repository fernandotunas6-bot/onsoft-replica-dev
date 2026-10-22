// Ensaio local (PGlite) de 20261018120000_lesson_meetings_server_only.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/lesson-meetings-server-only.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../../supabase/migrations/20261018120000_lesson_meetings_server_only.sql");
const pacote = read("../../docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql");
assert.ok(pacote.includes(migration), "o pacote leva a migração tal e qual");

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.siga_lesson_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, join_url text);
ALTER TABLE public.siga_lesson_meetings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.siga_lesson_meetings TO authenticated;
CREATE POLICY siga_lesson_meetings_read ON public.siga_lesson_meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage lesson meetings in own school (update)" ON public.siga_lesson_meetings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.siga_lesson_meetings (join_url) VALUES ('https://zoom.us/j/1');
`);
const sonda = async () =>
  (await db.query(pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════")))).rows[0][
    "20261018120000 reuniões Zoom só no servidor"
  ];
const asAuthenticated = async (sql) => {
  await db.exec("SET ROLE authenticated");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
};

// Antes: qualquer membro lia os links e mudava-os.
assert.equal(
  (await asAuthenticated("SELECT join_url FROM public.siga_lesson_meetings")).rows.length,
  1,
);
await asAuthenticated("UPDATE public.siga_lesson_meetings SET join_url = 'https://phish.example'");
assert.equal(await sonda(), "por aplicar");

await db.exec(migration);
await db.exec(migration);
assert.equal(await sonda(), "aplicada");

await assert.rejects(
  asAuthenticated("SELECT join_url FROM public.siga_lesson_meetings"),
  /permission denied/,
);
await assert.rejects(
  asAuthenticated("UPDATE public.siga_lesson_meetings SET join_url = 'x'"),
  /permission denied/,
);
await db.exec("SET ROLE service_role");
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM public.siga_lesson_meetings")).rows[0].n,
  1,
);
await db.exec("RESET ROLE");

console.log("lesson-meetings-server-only: só o servidor lê e escreve; idempotente.");
