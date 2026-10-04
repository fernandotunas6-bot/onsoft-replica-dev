// Ensaio local do pacote docs/agents/SIGA_aplicar_tempo_real.sql e da sonda de
// SIGA_confirmar_migracoes.sql (sem acesso à produção).
// Uso: node tests/sql/realtime-package.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
const table = (name) =>
  db.exec(`CREATE TABLE public.${name} (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`);

// Publicação como na produção a 2026-10-04 (as outras três tabelas não interessam aqui).
await table("school_announcements");
await db.exec("CREATE PUBLICATION supabase_realtime FOR TABLE public.school_announcements");
// As tabelas que a migração publica; finance_receipts fica para depois (tabela ausente é saltada).
for (const t of [
  "siga_direct_messages",
  "students",
  "enrollments",
  "enrollment_applications",
  "finance_invoices",
]) {
  await table(t);
}
// SIGA_confirmar_migracoes.sql pergunta privilégios nesta tabela; sem ela, a consulta falha.
await table("student_academic_history");
await db.exec("CREATE ROLE authenticated");

const published = async () =>
  (
    await db.query(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1",
    )
  ).rows.map((r) => r.tablename);

const probe = async () => {
  const rows = (await db.exec(read("../../docs/agents/SIGA_confirmar_migracoes.sql"))).at(-1).rows;
  return rows.find((r) => r.migracao === "20261004101000_realtime_publish_school_screens").estado;
};

assert.equal(await probe(), "EM FALTA");

// Migração sozinha, com finance_receipts ausente: salta-a sem erro.
await db.exec(read("../../supabase/migrations/20261004101000_realtime_publish_school_screens.sql"));
assert.deepEqual(await published(), [
  "enrollment_applications",
  "enrollments",
  "finance_invoices",
  "school_announcements",
  "siga_direct_messages",
  "students",
]);
assert.equal(await probe(), "EM FALTA");

// O pacote inteiro, como no SQL Editor, duas vezes seguidas.
await table("finance_receipts");
const pacote = read("../../docs/agents/SIGA_aplicar_tempo_real.sql");
for (let corrida = 0; corrida < 2; corrida++) {
  const confirmar = (await db.exec(pacote)).at(-1).rows[0];
  assert.deepEqual(confirmar, { "20261004101000 tempo real": "aplicada" });
}
assert.deepEqual(await published(), [
  "enrollment_applications",
  "enrollments",
  "finance_invoices",
  "finance_receipts",
  "school_announcements",
  "siga_direct_messages",
  "students",
]);
assert.equal(await probe(), "aplicada");

console.log(
  "pacote do tempo real: corre duas vezes; salta tabelas ausentes; confirmação e sonda dizem aplicada.",
);
