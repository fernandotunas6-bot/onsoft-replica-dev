// Ensaio local (PGlite) de 20261013100000_audit_logs_document_code_index.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/document-code-index.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
  "../../supabase/migrations/20261013100000_audit_logs_document_code_index.sql",
);
const pacote = read("../../docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql");
assert.ok(pacote.includes(migration), "o pacote leva a migração tal e qual");

const db = new PGlite();
await db.exec(`
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, actor_user_id uuid,
  action text NOT NULL, entity_type text, entity_id text, metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz DEFAULT now());
INSERT INTO public.audit_logs (action, metadata)
SELECT CASE WHEN g % 100 = 0 THEN 'documents.issued' ELSE 'students.updated' END,
       jsonb_build_object('code', 'C' || g)
FROM generate_series(1, 20000) g;
ANALYZE public.audit_logs;
`);
const sonda = async () =>
  (await db.query(pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════")))).rows[0][
    "20261013100000 índice da verificação"
  ];
assert.equal(await sonda(), "por aplicar");
await db.exec(migration);
await db.exec(migration);
assert.equal(await sonda(), "aplicada");

await db.exec("ANALYZE public.audit_logs;");
const plan = (
  await db.query(
    `EXPLAIN SELECT school_id FROM public.audit_logs
     WHERE action = 'documents.issued' AND metadata->>'code' = 'C500' LIMIT 1`,
  )
).rows
  .map((row) => row["QUERY PLAN"])
  .join("\n");
assert.match(plan, /audit_logs_issued_document_code_idx/, plan);

console.log("document-code-index: índice criado, usado pela consulta da verificação; idempotente.");
