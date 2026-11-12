// Ensaio local (PGlite) de 20261025070206_access_cards_one_active_per_person.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/access-cards-one-active.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
  "../../supabase/migrations/20261025070206_access_cards_one_active_per_person.sql",
);
const pacote = read("../../docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql");
assert.ok(pacote.includes(migration), "o pacote leva a migração tal e qual");

const db = new PGlite();
await db.exec(`
CREATE TABLE public.siga_access_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, person_id uuid NOT NULL,
  card_number text NOT NULL, status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(), UNIQUE (school_id, card_number));
`);
const sonda = async () =>
  (await db.query(pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════")))).rows[0][
    "20261018100000 cartão activo único"
  ];
const s = "00000000-0000-0000-0000-000000000001";
const p = "00000000-0000-0000-0000-000000000002";
const insert = (n, status = "active") =>
  db.query(
    `INSERT INTO public.siga_access_cards (school_id, person_id, card_number, status) VALUES ($1, $2, $3, $4)`,
    [s, p, n, status],
  );

// Antes: dois cartões activos para a mesma pessoa.
await insert("C1");
await insert("C2");
await db.exec("DELETE FROM public.siga_access_cards WHERE card_number = 'C2'");
assert.equal(await sonda(), "por aplicar");

await db.exec(migration);
await db.exec(migration);
assert.equal(await sonda(), "aplicada");

await assert.rejects(insert("C3"), /siga_access_cards_one_active_per_person/);
// Cartões revogados não contam: pode haver vários, e um novo activo depois de revogar.
await insert("C4", "revoked");
await insert("C5", "revoked");
await db.exec("UPDATE public.siga_access_cards SET status = 'revoked' WHERE card_number = 'C1'");
await insert("C6");

console.log("access-cards-one-active: um activo por pessoa; revogados livres; idempotente.");
