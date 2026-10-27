// Ensaio local do pacote docs/agents/SIGA_aplicar_tempo_real_avisos.sql e da sonda de
// SIGA_confirmar_migracoes.sql (sem acesso à produção).
// Uso: node tests/sql/realtime-notifications-package.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const MIGRACAO = "../../supabase/migrations/20261027100000_realtime_publish_notifications.sql";
const db = new PGlite();
const table = (name) =>
  db.exec(`CREATE TABLE public.${name} (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`);

// Publicação como na produção (o que já lá está não pode sair).
await table("school_announcements");
await table("siga_chat_messages");
await db.exec(
  "CREATE PUBLICATION supabase_realtime FOR TABLE public.school_announcements, public.siga_chat_messages",
);
// A sonda pergunta privilégios nestas tabelas e lê os destinos da importação.
await table("student_academic_history");
await table("siga_direct_messages");
await db.exec(
  "CREATE TABLE public.import_table_specs (table_schema text, table_name text, direct_import_policy text)",
);
await db.exec("CREATE ROLE authenticated");

const published = async () =>
  (
    await db.query(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1",
    )
  ).rows.map((r) => r.tablename);

const probe = async () => {
  const rows = (await db.exec(read("../../docs/agents/SIGA_confirmar_migracoes.sql"))).at(-1).rows;
  return rows.find((r) => r.migracao === "20261027100000_realtime_publish_notifications").estado;
};

assert.equal(await probe(), "EM FALTA");

// Sem a tabela: salta-a sem erro e não toca no resto.
await db.exec(read(MIGRACAO));
assert.deepEqual(await published(), ["school_announcements", "siga_chat_messages"]);
assert.equal(await probe(), "EM FALTA");

// O pacote inteiro, como no SQL Editor, duas vezes seguidas.
await table("notifications");
const pacote = read("../../docs/agents/SIGA_aplicar_tempo_real_avisos.sql");
assert.ok(pacote.includes(read(MIGRACAO)), "o pacote leva a migração tal e qual");
for (let corrida = 0; corrida < 2; corrida++) {
  const confirmar = (await db.exec(pacote)).at(-1).rows[0];
  assert.deepEqual(confirmar, { "20261027100000 tempo real dos avisos": "aplicada" });
}
assert.deepEqual(await published(), ["notifications", "school_announcements", "siga_chat_messages"]);
assert.equal(await probe(), "aplicada");

console.log(
  "pacote do tempo real dos avisos: corre duas vezes; salta a tabela ausente; mantém o que já estava publicado; confirmação e sonda dizem aplicada.",
);
