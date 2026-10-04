// Ensaio local do pacote docs/agents/SIGA_aplicar_comunicados_tempo_real.sql e
// das sondas de SIGA_confirmar_migracoes.sql (sem acesso à produção).
// Uso: node tests/sql/realtime-package.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(read("./announcements-fixture.sql"));
const staffMigration = read(
  "../../supabase/migrations/20260930130000_sensitive_tables_school_staff_only.sql",
);
await db.exec(
  staffMigration.match(
    /CREATE OR REPLACE FUNCTION private\.is_school_staff[\s\S]*?\$\$;\s*REVOKE[^;]*;\s*GRANT[^;]*;/,
  )[0],
);

// Publicação como na produção a 2026-10-04 (as outras três tabelas não interessam aqui).
await db.exec("CREATE PUBLICATION supabase_realtime FOR TABLE public.school_announcements");
// As tabelas que a migração publica; finance_receipts fica para depois (tabela ausente é saltada).
for (const t of [
  "siga_direct_messages",
  "students",
  "enrollments",
  "enrollment_applications",
  "finance_invoices",
]) {
  await db.exec(`CREATE TABLE public.${t} (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`);
}
// As sondas de SIGA_confirmar_migracoes.sql perguntam privilégios destas duas.
await db.exec("CREATE TABLE public.student_academic_history (id uuid PRIMARY KEY)");

const published = async () =>
  (
    await db.query(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1",
    )
  ).rows.map((r) => r.tablename);

const probes = async () => {
  const results = await db.exec(read("../../docs/agents/SIGA_confirmar_migracoes.sql"));
  const rows = results.at(-1).rows;
  return Object.fromEntries(
    rows.filter((r) => r.migracao.startsWith("20261004")).map((r) => [r.migracao, r.estado]),
  );
};

assert.deepEqual(await probes(), {
  "20261004100000_announcements_read_by_role": "EM FALTA",
  "20261004101000_realtime_publish_school_screens": "EM FALTA",
});

// Migração do tempo real sozinha, com finance_receipts ausente: salta-a sem erro.
await db.exec(read("../../supabase/migrations/20261004101000_realtime_publish_school_screens.sql"));
assert.deepEqual(await published(), [
  "enrollment_applications",
  "enrollments",
  "finance_invoices",
  "school_announcements",
  "siga_direct_messages",
  "students",
]);

// O pacote inteiro, como no SQL Editor, duas vezes seguidas.
await db.exec(
  "CREATE TABLE public.finance_receipts (id uuid PRIMARY KEY DEFAULT gen_random_uuid())",
);
const pacote = read("../../docs/agents/SIGA_aplicar_comunicados_tempo_real.sql");
for (let corrida = 0; corrida < 2; corrida++) {
  const confirmar = (await db.exec(pacote)).at(-1).rows[0];
  assert.deepEqual(confirmar, {
    "20261004100000 comunicados por papel": "aplicada",
    "20261004101000 tempo real": "aplicada",
  });
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
assert.deepEqual(await probes(), {
  "20261004100000_announcements_read_by_role": "aplicada",
  "20261004101000_realtime_publish_school_screens": "aplicada",
});

console.log(
  "pacote comunicados/tempo real: corre duas vezes; salta tabelas ausentes; confirmação e sondas dizem aplicada.",
);
