// Ensaio local (PGlite) de 20261002090137_gateway_settlement_atomic.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/gateway-settlement.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
// Colunas de finance_invoices/finance_receipts como em audit-fixture.sql (lidas da produção).
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE TABLE public.finance_invoices("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"contract_id" uuid NOT NULL,"fee_item_id" uuid NOT NULL,"invoice_number" text NOT NULL,"competence_month" date,"amount" numeric NOT NULL,"discount_amount" numeric DEFAULT 0 NOT NULL,"due_date" date NOT NULL,"status" text DEFAULT 'open'::text NOT NULL,"issued_by" uuid NOT NULL,"cancelled_at" timestamp with time zone,"cancelled_by" uuid,"cancellation_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"penalty_amount" numeric DEFAULT 0 NOT NULL);
CREATE TABLE public.finance_receipts("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"invoice_id" uuid NOT NULL,"receipt_number" text NOT NULL,"amount" numeric NOT NULL,"paid_on" date NOT NULL,"payment_method" text NOT NULL,"received_by" uuid NOT NULL,"status" text DEFAULT 'issued'::text NOT NULL,"reversed_at" timestamp with time zone,"reversed_by" uuid,"reversal_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"external_id" text);
CREATE UNIQUE INDEX finance_receipts_school_external_id_key ON public.finance_receipts (school_id, external_id) WHERE external_id IS NOT NULL;
CREATE SEQUENCE private.rec_seq;
-- Simulação da numeração (a real usa document_sequences com FOR UPDATE).
CREATE FUNCTION private.next_document_number_service(s uuid, t text, p text) RETURNS text
  LANGUAGE sql AS $$ SELECT p || '-' || lpad(nextval('private.rec_seq')::text, 4, '0') $$;
`);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261002090137_gateway_settlement_atomic.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);

const school = "00000000-0000-0000-0000-00000000000a";
const other = "00000000-0000-0000-0000-00000000000b";
const user = "00000000-0000-0000-0000-000000000001";
const {
  rows: [inv],
} = await db.query(
  `insert into finance_invoices(school_id,contract_id,fee_item_id,invoice_number,amount,discount_amount,penalty_amount,due_date,issued_by)
   values($1,$2,$2,'F-1',100,10,5,current_date,$2) returning id`,
  [school, user],
);
const settle = (amount, ext, s = school) =>
  db
    .query("select public.settle_gateway_payment_service($1,$2,$3,'card',$4,$5) as r", [
      s,
      inv.id,
      amount,
      user,
      ext,
    ])
    .then((r) => r.rows[0].r);
const receipts = async () =>
  Number((await db.query("select count(*) n from finance_receipts")).rows[0].n);

// Só service_role executa.
const grants = await db.query(
  `select has_function_privilege('authenticated','public.settle_gateway_payment_service(uuid,uuid,numeric,text,uuid,text,date)','EXECUTE') a,
          has_function_privilege('anon','public.settle_gateway_payment_service(uuid,uuid,numeric,text,uuid,text,date)','EXECUTE') b,
          has_function_privilege('service_role','public.settle_gateway_payment_service(uuid,uuid,numeric,text,uuid,text,date)','EXECUTE') c`,
);
assert.deepEqual(grants.rows[0], { a: false, b: false, c: true });

// Saldo = 100 - 10 + 5 = 95. Pagamento parcial.
let r = await settle(40, "tx-000001");
assert.equal(r.invoiceStatus, "partially_paid");
assert.equal(r.alreadyPaid, false);
// Reenvio da mesma transacção: mesmo recibo, nada novo.
const again = await settle(40, "tx-000001");
assert.equal(again.alreadyPaid, true);
assert.equal(again.receiptNumber, r.receiptNumber);
assert.equal(await receipts(), 1);
// Acima do saldo (40 + 60 > 95): recusa e não escreve.
await assert.rejects(settle(60, "tx-000002"), /excede o saldo/);
assert.equal(await receipts(), 1);
// Outra escola não liquida esta fatura.
await assert.rejects(settle(10, "tx-000003", other), /não encontrada/);
// Resto exacto: paga.
r = await settle(55, "tx-000004");
assert.equal(r.invoiceStatus, "paid");
assert.equal((await db.query("select status from finance_invoices")).rows[0].status, "paid");
// Fatura paga: não emite mais.
assert.equal((await settle(1, "tx-000005")).alreadyPaid, true);
assert.equal(await receipts(), 2);
// Sem identificador da transacção: recusa.
await assert.rejects(settle(1, ""), /Identificador/);

console.log("gateway-settlement: todas as verificações passaram");
