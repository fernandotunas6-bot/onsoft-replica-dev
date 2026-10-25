// Ensaio local (PGlite) de 20261025090000_one_tuition_invoice_per_month.sql. Sem produção.
//   SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/one-tuition-per-month.mjs
//
// O PGlite tem uma ligação só: a espera de uma emissão pela outra (advisory lock)
// não se simula aqui. Verifica-se a regra que a segunda encontra depois do COMMIT.
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
// Colunas de fee_items e finance_invoices como no retrato; CHECK de `kind` e de `status`
// com os valores da produção.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE TABLE public.fee_items("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"school_id" uuid NOT NULL,"fee_plan_id" uuid NOT NULL DEFAULT gen_random_uuid(),"code" text NOT NULL DEFAULT 'X',"name" text NOT NULL DEFAULT 'Item',"kind" text NOT NULL CHECK (kind IN ('enrollment','other','service','tuition')),"amount" numeric NOT NULL DEFAULT 0,"frequency" text NOT NULL DEFAULT 'monthly',"is_active" boolean DEFAULT true,"created_at" timestamptz DEFAULT now(),"grade_level_id" uuid);
CREATE TABLE public.finance_invoices("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"contract_id" uuid NOT NULL,"fee_item_id" uuid NOT NULL,"invoice_number" text NOT NULL,"competence_month" date,"amount" numeric NOT NULL,"discount_amount" numeric DEFAULT 0 NOT NULL,"due_date" date NOT NULL,"status" text DEFAULT 'open'::text NOT NULL CHECK (status IN ('cancelled','open','paid','partially_paid')),"issued_by" uuid NOT NULL,"cancelled_at" timestamp with time zone,"cancelled_by" uuid,"cancellation_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"penalty_amount" numeric DEFAULT 0 NOT NULL);
`);
await db.exec(
  readFileSync(
    new URL(
      "../../supabase/migrations/20261025090000_one_tuition_invoice_per_month.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);

const ESCOLA_A = "00000000-0000-4000-8000-00000000000a";
const ESCOLA_B = "00000000-0000-4000-8000-00000000000b";
const um = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const item = async (escola, kind, classe = null) =>
  (
    await um(
      "INSERT INTO public.fee_items (school_id, kind, grade_level_id) VALUES ($1, $2, $3) RETURNING id",
      [escola, kind, classe],
    )
  ).id;
const emitir = async (escola, contrato, feeItem, mes) =>
  (
    await um(
      `INSERT INTO public.finance_invoices (school_id, contract_id, fee_item_id, invoice_number, competence_month, amount, due_date, issued_by)
       VALUES ($1, $2, $3, 'FT-' || gen_random_uuid(), $4, 10000, '2026-11-10', gen_random_uuid()) RETURNING id`,
      [escola, contrato, feeItem, mes],
    )
  ).id;
const recusa = async (promessa) => {
  await assert.rejects(promessa, (erro) => {
    assert.match(String(erro.message), /já tem a propina deste mês/);
    // 22023 e não 23505: o 23505 faria issueInvoice tentar outro número da série.
    assert.equal(erro.code, "22023");
    return true;
  });
};

const contrato = "00000000-0000-4000-8000-0000000000c1";
const outroContrato = "00000000-0000-4000-8000-0000000000c2";
const propinaGeral = await item(ESCOLA_A, "tuition");
const propinaClasse = await item(ESCOLA_A, "tuition", "00000000-0000-4000-8000-0000000000d1");
const emolumento = await item(ESCOLA_A, "service");

const novembro = await emitir(ESCOLA_A, contrato, propinaGeral, "2026-11-01");
// A segunda do mesmo mês é recusada, também pelo preço da classe (outro item, mesmo tipo).
await recusa(emitir(ESCOLA_A, contrato, propinaGeral, "2026-11-01"));
await recusa(emitir(ESCOLA_A, contrato, propinaClasse, "2026-11-01"));
// Paga continua a contar.
await db.query("UPDATE public.finance_invoices SET status = 'paid' WHERE id = $1", [novembro]);
await recusa(emitir(ESCOLA_A, contrato, propinaGeral, "2026-11-01"));
// Anulada deixa emitir outra.
await db.query("UPDATE public.finance_invoices SET status = 'cancelled' WHERE id = $1", [novembro]);
await emitir(ESCOLA_A, contrato, propinaClasse, "2026-11-01");

// O que não é a mesma propina passa.
await emitir(ESCOLA_A, contrato, propinaGeral, "2026-12-01");
await emitir(ESCOLA_A, outroContrato, propinaGeral, "2026-11-01");
await emitir(ESCOLA_A, contrato, emolumento, "2026-11-01");
await emitir(ESCOLA_A, contrato, emolumento, "2026-11-01");
await emitir(ESCOLA_A, contrato, propinaGeral, null);
await emitir(ESCOLA_A, contrato, propinaGeral, null);
// Só com emolumentos no mês, a propina passa: a procura conta só propinas.
const outroAluno = "00000000-0000-4000-8000-0000000000c3";
await emitir(ESCOLA_A, outroAluno, emolumento, "2026-11-01");
await emitir(ESCOLA_A, outroAluno, propinaGeral, "2026-11-01");
// Item de outra escola: o tipo não se lê, a regra não se aplica a partir dele.
const propinaB = await item(ESCOLA_B, "tuition");
await emitir(ESCOLA_B, contrato, propinaB, "2026-11-01");
await recusa(emitir(ESCOLA_B, contrato, propinaB, "2026-11-01"));

// Faturas já existentes não mudam: um UPDATE não passa pelo gatilho.
const n = await um(
  "SELECT count(*)::int AS n FROM public.finance_invoices WHERE school_id = $1 AND contract_id = $2 AND competence_month = '2026-11-01' AND status <> 'cancelled' AND fee_item_id IN ($3, $4)",
  [ESCOLA_A, contrato, propinaGeral, propinaClasse],
);
assert.equal(n.n, 1);
const duplicada = await um(
  "SELECT id FROM public.finance_invoices WHERE school_id = $1 AND contract_id = $2 AND fee_item_id = $3 AND competence_month = '2026-12-01'",
  [ESCOLA_A, contrato, propinaGeral],
);
await db.query("UPDATE public.finance_invoices SET amount = 12000 WHERE id = $1", [duplicada.id]);

const p = await um(`SELECT
  has_function_privilege('anon', 'private.finance_invoice_one_tuition_per_month()', 'EXECUTE') AS anon,
  has_function_privilege('authenticated', 'private.finance_invoice_one_tuition_per_month()', 'EXECUTE') AS auth`);
assert.deepEqual(p, { anon: false, auth: false });

console.log(
  "one-tuition-per-month: segunda propina do mês recusada com 22023, anulada liberta, o resto passa — ok",
);
