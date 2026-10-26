// Ensaio local (PGlite) de 20261024090000_reverse_receipt_counts_late_fee.sql e
// 20261024100000_register_payment_idempotency_key.sql. Sem produção.
//   SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/payment-integrity.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
// Colunas de finance_invoices/finance_receipts como em late-fee.mjs (lidas da produção).
// Permissões, papel, numeração e multa simulados: a multa vem já gravada na fatura.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.has_permission(s uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.sga_app_role(s uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'Tesouraria' $$;
CREATE FUNCTION private.late_fee_due(s uuid, a numeric, d date, p numeric, o date, m text) RETURNS numeric
  LANGUAGE sql STABLE AS $$ SELECT 0::numeric $$;
CREATE SEQUENCE private.rec_seq;
CREATE FUNCTION private.next_document_number(s uuid, t text) RETURNS text
  LANGUAGE sql AS $$ SELECT 'REC-' || lpad(nextval('private.rec_seq')::text, 4, '0') $$;
CREATE TABLE public.staff_module_grants(school_id uuid NOT NULL, user_id uuid NOT NULL, module_key text NOT NULL, level text NOT NULL);
CREATE TABLE public.finance_invoices("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"contract_id" uuid NOT NULL,"fee_item_id" uuid NOT NULL,"invoice_number" text NOT NULL,"competence_month" date,"amount" numeric NOT NULL,"discount_amount" numeric DEFAULT 0 NOT NULL,"due_date" date NOT NULL,"status" text DEFAULT 'open'::text NOT NULL,"issued_by" uuid NOT NULL,"cancelled_at" timestamp with time zone,"cancelled_by" uuid,"cancellation_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"penalty_amount" numeric DEFAULT 0 NOT NULL);
CREATE TABLE public.finance_receipts("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"invoice_id" uuid NOT NULL,"receipt_number" text NOT NULL,"amount" numeric NOT NULL,"paid_on" date NOT NULL,"payment_method" text NOT NULL,"received_by" uuid NOT NULL,"status" text DEFAULT 'issued'::text NOT NULL,"reversed_at" timestamp with time zone,"reversed_by" uuid,"reversal_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"external_id" text);
-- register_payment de antes da 20261024100000 (cinco parâmetros), para a migração a substituir.
CREATE FUNCTION private.register_payment(a uuid, b uuid, c numeric, d text, e date DEFAULT CURRENT_DATE) RETURNS jsonb
  LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.register_payment(school_id uuid, invoice_id uuid, amount numeric, payment_method text, paid_on date DEFAULT CURRENT_DATE) RETURNS jsonb
  LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
`);

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const estorno = read(
  "../../supabase/migrations/20261024090000_reverse_receipt_counts_late_fee.sql",
);
const chave = read("../../supabase/migrations/20261024100000_register_payment_idempotency_key.sql");
for (let corrida = 0; corrida < 2; corrida++) {
  await db.exec(estorno);
  await db.exec(chave);
}
const assinaturas = await db.query(
  "SELECT oid::regprocedure::text AS f FROM pg_proc WHERE proname = 'register_payment' ORDER BY 1",
);
assert.deepEqual(
  assinaturas.rows.map((r) => r.f),
  [
    "private.register_payment(uuid,uuid,numeric,text,date,uuid)",
    "register_payment(uuid,uuid,numeric,text,date,uuid)",
  ],
  "a assinatura antiga desaparece e a nova fica uma só",
);

const ESCOLA_A = "00000000-0000-4000-8000-00000000000a";
const ESCOLA_B = "00000000-0000-4000-8000-00000000000b";
const OPERADOR = "00000000-0000-4000-8000-0000000000aa";
const como = (uid) => db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
await como(OPERADOR);

const fatura = async (escola, valor, multa = 0) =>
  (
    await db.query(
      `INSERT INTO public.finance_invoices (school_id, contract_id, fee_item_id, invoice_number, amount, penalty_amount, due_date, issued_by)
       VALUES ($1, gen_random_uuid(), gen_random_uuid(), 'FT-' || gen_random_uuid(), $2, $3, '2026-10-10', $4) RETURNING id`,
      [escola, valor, multa, OPERADOR],
    )
  ).rows[0].id;
const pagar = async (escola, invoice, valor, key = null) =>
  (
    await db.query("SELECT public.register_payment($1, $2, $3, 'cash', '2026-10-20', $4) AS r", [
      escola,
      invoice,
      valor,
      key,
    ])
  ).rows[0].r;
const estornar = async (escola, recibo) =>
  (
    await db.query("SELECT private.reverse_finance_receipt($1, $2, 'Erro de caixa') AS r", [
      escola,
      recibo,
    ])
  ).rows[0].r;
const estado = async (invoice) =>
  (await db.query("SELECT status FROM public.finance_invoices WHERE id = $1", [invoice])).rows[0]
    .status;
const recibos = async (invoice) =>
  Number(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM public.finance_receipts WHERE invoice_id = $1",
        [invoice],
      )
    ).rows[0].n,
  );
const recusa = async (promessa, mensagem) => {
  await assert.rejects(promessa, (erro) => {
    assert.match(String(erro.message), mensagem);
    return true;
  });
};

// ── 20261024090000: o estorno conta a multa ─────────────────────────────────
// 10 000 Kz com 1 000 de multa, paga em 5 000 + 5 500 + 500. Estornar os 500 deixa
// 10 500 pagos contra 11 000: a fatura volta a parcial e os 500 voltam a cobrar-se.
{
  const f = await fatura(ESCOLA_A, 10000, 1000);
  await pagar(ESCOLA_A, f, 5000);
  await pagar(ESCOLA_A, f, 5500);
  const ultimo = await pagar(ESCOLA_A, f, 500);
  assert.equal(ultimo.invoiceStatus, "paid");
  await estornar(ESCOLA_A, ultimo.receiptId);
  assert.equal(await estado(f), "partially_paid", "estornar com multa deixa a fatura parcial");
  assert.equal((await pagar(ESCOLA_A, f, 500)).invoiceStatus, "paid", "os 500 voltam a cobrar-se");
  await recusa(estornar(ESCOLA_A, ultimo.receiptId), /já foi estornado/);
  // Estornar tudo deixa-a em aberto.
  const todos = await db.query(
    "SELECT id FROM public.finance_receipts WHERE invoice_id = $1 AND status = 'issued'",
    [f],
  );
  for (const { id } of todos.rows) await estornar(ESCOLA_A, id);
  assert.equal(await estado(f), "open");
}

// ── 20261024100000: a mesma tentativa não emite dois recibos ────────────────
{
  const f = await fatura(ESCOLA_A, 10000);
  const key = "11111111-1111-4111-8111-111111111111";
  const primeiro = await pagar(ESCOLA_A, f, 4000, key);
  const repetido = await pagar(ESCOLA_A, f, 4000, key);
  assert.equal(repetido.replayed, true);
  assert.equal(repetido.receiptId, primeiro.receiptId);
  assert.equal(repetido.receiptNumber, primeiro.receiptNumber);
  assert.equal(repetido.invoiceStatus, "partially_paid");
  assert.equal(await recibos(f), 1, "a repetição não emite recibo");
  await recusa(pagar(ESCOLA_A, f, 4500, key), /já foi usada noutro pagamento/);
  const outra = await fatura(ESCOLA_A, 10000);
  await recusa(pagar(ESCOLA_A, outra, 4000, key), /já foi usada noutro pagamento/);
  // Sem chave, como antes: dois pagamentos são dois recibos.
  await pagar(ESCOLA_A, f, 1000);
  await pagar(ESCOLA_A, f, 1000);
  assert.equal(await recibos(f), 3);
  // A chave é por escola: a mesma noutra escola é outro pagamento.
  const fb = await fatura(ESCOLA_B, 10000);
  assert.equal((await pagar(ESCOLA_B, fb, 4000, key)).replayed, undefined);
  assert.equal(await recibos(fb), 1);
  // A fatura paga continua recusada a um pagamento novo, mas a repetição devolve o recibo.
  const fp = await fatura(ESCOLA_A, 2000);
  const kp = "22222222-2222-4222-8222-222222222222";
  assert.equal((await pagar(ESCOLA_A, fp, 2000, kp)).invoiceStatus, "paid");
  assert.equal((await pagar(ESCOLA_A, fp, 2000, kp)).invoiceStatus, "paid");
  await recusa(pagar(ESCOLA_A, fp, 1), /cancelada ou já paga/);
  assert.equal(await recibos(fp), 1);
}

// ── Isolamento entre escolas ────────────────────────────────────────────────
{
  const fa = await fatura(ESCOLA_A, 3000);
  const r = await pagar(ESCOLA_A, fa, 1000);
  await recusa(pagar(ESCOLA_B, fa, 1000), /Fatura inválida/);
  await recusa(
    pagar(ESCOLA_B, fa, 1000, "33333333-3333-4333-8333-333333333333"),
    /Fatura inválida/,
  );
  await recusa(estornar(ESCOLA_B, r.receiptId), /Recibo não encontrado/);
  assert.equal(await recibos(fa), 1);
  assert.equal(await estado(fa), "partially_paid");
}

// ── Sem sessão, sem permissão e sem anon ────────────────────────────────────
{
  const f = await fatura(ESCOLA_A, 1000);
  await db.exec("SELECT set_config('request.jwt.claim.sub', '', false)");
  await recusa(pagar(ESCOLA_A, f, 100), /Sem autorização/);
  await como(OPERADOR);
  await db.exec(
    `INSERT INTO public.staff_module_grants VALUES ('${ESCOLA_A}', '${OPERADOR}', 'financeiro', 'Leitura')`,
  );
  const r = await pagar(ESCOLA_A, f, 100);
  await recusa(estornar(ESCOLA_A, r.receiptId), /Sem autorização para estornar/);
  await db.exec("DELETE FROM public.staff_module_grants");
  const grants = await db.query(`SELECT
    has_function_privilege('anon', 'public.register_payment(uuid,uuid,numeric,text,date,uuid)', 'EXECUTE') AS anon_pub,
    has_function_privilege('anon', 'private.register_payment(uuid,uuid,numeric,text,date,uuid)', 'EXECUTE') AS anon_priv,
    has_function_privilege('authenticated', 'public.register_payment(uuid,uuid,numeric,text,date,uuid)', 'EXECUTE') AS auth_pub,
    has_function_privilege('service_role', 'public.register_payment(uuid,uuid,numeric,text,date,uuid)', 'EXECUTE') AS service_pub`);
  assert.deepEqual(grants.rows[0], {
    anon_pub: false,
    anon_priv: false,
    auth_pub: true,
    service_pub: true,
  });
}

console.log("payment-integrity: estorno com multa, idempotência, isolamento e permissões — ok");
