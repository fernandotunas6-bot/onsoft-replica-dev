// Ensaio local (PGlite) de 20261025130000_offline_sync_receipts.sql. Sem produção.
//   SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/offline-sync-receipts.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE TABLE public.schools(id uuid PRIMARY KEY);
`);
await db.exec(
  readFileSync(
    new URL("../../supabase/migrations/20261025130000_offline_sync_receipts.sql", import.meta.url),
    "utf8",
  ),
);

const ESCOLA_A = "00000000-0000-4000-8000-00000000000a";
const ESCOLA_B = "00000000-0000-4000-8000-00000000000b";
const PROF = "00000000-0000-4000-8000-0000000000a1";
const OUTRO = "00000000-0000-4000-8000-0000000000a2";
const OP = "11111111-1111-4111-8111-111111111111";
const H1 = "a".repeat(64);
const H2 = "b".repeat(64);
await db.exec(`INSERT INTO public.schools VALUES ('${ESCOLA_A}'), ('${ESCOLA_B}')`);

const claim = async (escola, op, actor, kind, hash, stale = 120) =>
  (
    await db.query("SELECT public.offline_receipt_claim($1, $2, $3, 'posto-1', $4, $5, $6) AS r", [
      escola,
      op,
      actor,
      kind,
      hash,
      stale,
    ])
  ).rows[0].r;
const complete = async (escola, op, result) =>
  (await db.query("SELECT public.offline_receipt_complete($1, $2, $3) AS r", [escola, op, result]))
    .rows[0].r;
const release = async (escola, op) =>
  (await db.query("SELECT public.offline_receipt_release($1, $2) AS r", [escola, op])).rows[0].r;

// Primeiro envio: recibo aberto; o mesmo op_id logo a seguir está em curso.
assert.deepEqual(await claim(ESCOLA_A, OP, PROF, "attendance.submit", H1), { outcome: "claimed" });
assert.deepEqual(await claim(ESCOLA_A, OP, PROF, "attendance.submit", H1), {
  outcome: "in_progress",
});
// Fechado com o resultado: repetir devolve-o sem gravar de novo.
assert.equal(await complete(ESCOLA_A, OP, { ok: true, count: 3 }), true);
assert.equal(await complete(ESCOLA_A, OP, { ok: false }), false, "um recibo fecha uma só vez");
assert.deepEqual(await claim(ESCOLA_A, OP, PROF, "attendance.submit", H1), {
  outcome: "done",
  result: { ok: true, count: 3 },
});
// O mesmo op_id com outros dados, outra conta ou outro tipo é recusado.
for (const [actor, kind, hash] of [
  [PROF, "attendance.submit", H2],
  [OUTRO, "attendance.submit", H1],
  [PROF, "grades.term", H1],
]) {
  assert.deepEqual(await claim(ESCOLA_A, OP, actor, kind, hash), { outcome: "mismatch" });
}
// A chave é por escola: o mesmo op_id noutra escola é outro envio.
assert.deepEqual(await claim(ESCOLA_B, OP, PROF, "attendance.submit", H1), { outcome: "claimed" });
assert.equal(await release(ESCOLA_B, OP), true);

// Recusa de negócio: o recibo aberto sai e o op_id pode voltar com dados corrigidos.
const OP2 = "22222222-2222-4222-8222-222222222222";
assert.deepEqual(await claim(ESCOLA_A, OP2, PROF, "grades.term", H1), { outcome: "claimed" });
assert.equal(await release(ESCOLA_A, OP2), true);
assert.deepEqual(await claim(ESCOLA_A, OP2, PROF, "grades.term", H2), { outcome: "claimed" });
// Um recibo fechado não se liberta.
assert.equal(await complete(ESCOLA_A, OP2, { saved: 2 }), true);
assert.equal(await release(ESCOLA_A, OP2), false);

// Envio que caiu a meio: aberto há mais do que o prazo é retomado («stale»), e quem
// chegar logo a seguir vê-o outra vez em curso.
const OP3 = "33333333-3333-4333-8333-333333333333";
assert.deepEqual(await claim(ESCOLA_A, OP3, PROF, "grades.term", H1), { outcome: "claimed" });
await db.query(
  "UPDATE public.offline_sync_receipts SET started_at = now() - interval '10 minutes' WHERE op_id = $1",
  [OP3],
);
assert.deepEqual(await claim(ESCOLA_A, OP3, PROF, "grades.term", H1), { outcome: "stale" });
assert.deepEqual(await claim(ESCOLA_A, OP3, PROF, "grades.term", H1), { outcome: "in_progress" });
// Retomado, mas com outros dados, continua recusado.
await db.query(
  "UPDATE public.offline_sync_receipts SET started_at = now() - interval '10 minutes' WHERE op_id = $1",
  [OP3],
);
assert.deepEqual(await claim(ESCOLA_A, OP3, PROF, "grades.term", H2), { outcome: "mismatch" });

// Restrições: hash em hexadecimal de 64, tipo conhecido, recibo fechado com resultado.
await assert.rejects(claim(ESCOLA_A, OP, PROF, "attendance.submit", "x"), /check constraint/);
await assert.rejects(
  claim(ESCOLA_A, "44444444-4444-4444-8444-444444444444", PROF, "payment", H1),
  /check constraint/,
);
await assert.rejects(
  db.query("UPDATE public.offline_sync_receipts SET status = 'done' WHERE op_id = $1", [OP3]),
  /offline_sync_receipts_done_complete/,
);

// Só o servidor.
const p = (
  await db.query(`SELECT
  has_table_privilege('authenticated', 'public.offline_sync_receipts', 'SELECT') AS auth_le,
  has_table_privilege('anon', 'public.offline_sync_receipts', 'SELECT') AS anon_le,
  has_function_privilege('authenticated', 'public.offline_receipt_claim(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE') AS auth_claim,
  has_function_privilege('anon', 'public.offline_receipt_release(uuid,uuid)', 'EXECUTE') AS anon_release,
  has_function_privilege('service_role', 'public.offline_receipt_claim(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE') AS servico,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.offline_sync_receipts'::regclass) AS rls`)
).rows[0];
assert.deepEqual(p, {
  auth_le: false,
  anon_le: false,
  auth_claim: false,
  anon_release: false,
  servico: true,
  rls: true,
});

console.log(
  "offline-sync-receipts: abrir, repetir, recusar outros dados, libertar, retomar envio caído e privilégios — ok",
);
