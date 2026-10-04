// Ensaio local (PGlite) de 20261004140000_late_fee_one_rule.sql. Sem produção.
// Executar (carrega também a regra em TypeScript, para comparar as duas):
//   SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node --experimental-strip-types tests/sql/late-fee.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import { register } from "node:module";
import assert from "node:assert/strict";

// O código da aplicação importa com `@/` e sem extensão (resolvido pelo Vite); aqui, um
// resolve mínimo para carregar a regra e a leitura das definições tal como estão.
const SRC = new URL("../../src/", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
const SRC = ${JSON.stringify(SRC)};
export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = new URL(specifier.slice(2), SRC).href;
  else if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith(SRC))
    base = new URL(specifier, context.parentURL).href;
  if (base) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try { return await next(base + ext, context); } catch {}
    }
  }
  return next(specifier, context);
}`),
);
const { lateFeeFor, lateFeeChannelOfLedgerMethod } = await import(
  new URL("../../src/features/finance/late-fee.ts", import.meta.url).href
);
const { parseSettingsDomain } = await import(
  new URL("../../src/features/school/settings-domains.ts", import.meta.url).href
);

const db = new PGlite();
// Colunas de finance_invoices/finance_receipts como em audit-fixture.sql (lidas da produção);
// school_settings com as colunas do retrato. Permissões e numeração simuladas.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.has_permission(s uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE SEQUENCE private.rec_seq;
CREATE FUNCTION private.next_document_number(s uuid, t text) RETURNS text
  LANGUAGE sql AS $$ SELECT 'REC-' || lpad(nextval('private.rec_seq')::text, 4, '0') $$;
CREATE TABLE public.finance_invoices("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"contract_id" uuid NOT NULL,"fee_item_id" uuid NOT NULL,"invoice_number" text NOT NULL,"competence_month" date,"amount" numeric NOT NULL,"discount_amount" numeric DEFAULT 0 NOT NULL,"due_date" date NOT NULL,"status" text DEFAULT 'open'::text NOT NULL,"issued_by" uuid NOT NULL,"cancelled_at" timestamp with time zone,"cancelled_by" uuid,"cancellation_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"penalty_amount" numeric DEFAULT 0 NOT NULL);
CREATE TABLE public.finance_receipts("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"invoice_id" uuid NOT NULL,"receipt_number" text NOT NULL,"amount" numeric NOT NULL,"paid_on" date NOT NULL,"payment_method" text NOT NULL,"received_by" uuid NOT NULL,"status" text DEFAULT 'issued'::text NOT NULL,"reversed_at" timestamp with time zone,"reversed_by" uuid,"reversal_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"external_id" text);
CREATE TABLE public.school_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, domain text NOT NULL, version integer NOT NULL DEFAULT 1, value jsonb NOT NULL DEFAULT '{}'::jsonb, changed_by uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (school_id, domain));
`);

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pacote = read("../../docs/agents/SIGA_aplicar_multas_atraso.sql");
const confirmar = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const estado = async () => Object.values((await db.query(confirmar)).rows[0])[0];
// SIGA_confirmar_migracoes.sql pergunta privilégios nestas duas; sem elas, a consulta falha.
await db.exec(
  "CREATE TABLE public.siga_direct_messages (id uuid PRIMARY KEY); CREATE TABLE public.student_academic_history (id uuid PRIMARY KEY);",
);
const sonda = async () =>
  (await db.exec(read("../../docs/agents/SIGA_confirmar_migracoes.sql")))
    .at(-1)
    .rows.find((r) => r.migracao === "20261004140000_late_fee_one_rule").estado;
assert.equal(await estado(), "por aplicar");
assert.equal(await sonda(), "EM FALTA");

// O pacote inteiro, como no SQL Editor, duas vezes seguidas.
for (let corrida = 0; corrida < 2; corrida++) {
  assert.deepEqual((await db.exec(pacote)).at(-1).rows[0], {
    "20261004140000 multa por atraso": "aplicada",
  });
}
assert.equal(await sonda(), "aplicada");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const user = "00000000-0000-0000-0000-000000000001";
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);

const setRule = (school, value) =>
  db.query(
    `insert into school_settings(school_id, domain, value) values ($1, 'billing', $2)
     on conflict (school_id, domain) do update set value = excluded.value`,
    [school, JSON.stringify(value)],
  );
const invoice = async (school, amount, due, discount = 0, penalty = 0) =>
  (
    await db.query(
      `insert into finance_invoices(school_id,contract_id,fee_item_id,invoice_number,amount,discount_amount,penalty_amount,due_date,issued_by)
       values($1,$2,$2,'F',$3,$4,$5,$6,$2) returning id`,
      [school, user, amount, discount, penalty, due],
    )
  ).rows[0].id;
const pay = (school, id, amount, method, paidOn) =>
  db
    .query("select public.register_payment($1,$2,$3,$4,$5) as r", [
      school,
      id,
      amount,
      method,
      paidOn,
    ])
    .then((r) => r.rows[0].r);
const row = async (id) =>
  (
    await db.query(
      "select status, penalty_amount::numeric as p from finance_invoices where id=$1",
      [id],
    )
  ).rows[0];

// Wrapper público como na produção (INVOKER, chama a privada).
await db.exec(`
CREATE OR REPLACE FUNCTION public.register_payment(school_id uuid, invoice_id uuid, amount numeric, payment_method text, paid_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $$
  select private.register_payment(school_id, invoice_id, amount, payment_method, paid_on); $$;
`);

// 1. Sem regras gravadas: sem multa, mesmo muito atrasado.
let inv = await invoice(A, 15000, "2026-09-10");
assert.equal((await pay(A, inv, 15000, "cash", "2026-12-31")).invoiceStatus, "paid");
assert.equal(Number((await row(inv)).p), 0);

// 2. 2 % com 5 dias, todos os pagamentos: no último dia da tolerância não há multa;
//    no dia a seguir aplica-se uma vez (300) e entra no total.
await setRule(A, { late_fee_percent: 2, grace_days: 5 });
inv = await invoice(A, 15000, "2026-09-10");
assert.equal((await pay(A, inv, 1000, "cash", "2026-09-15")).invoiceStatus, "partially_paid");
assert.equal(Number((await row(inv)).p), 0);
assert.equal((await pay(A, inv, 14000, "cash", "2026-09-16")).invoiceStatus, "partially_paid");
assert.equal(Number((await row(inv)).p), 300);
assert.equal((await pay(A, inv, 300, "bank_transfer", "2026-10-30")).invoiceStatus, "paid");
assert.equal(Number((await row(inv)).p), 300, "a multa aplica-se uma só vez");

// 3. Recusado por exceder o saldo: a multa gravada nessa tentativa desfaz-se.
inv = await invoice(A, 1000, "2026-09-01");
await assert.rejects(pay(A, inv, 1021, "cash", "2026-10-01"), /excede o saldo/);
assert.equal(Number((await row(inv)).p), 0);
assert.equal((await pay(A, inv, 1020, "cash", "2026-10-01")).invoiceStatus, "paid");

// 4. Só nos electrónicos: numerário e transferência sem multa; Multicaixa (card) e
//    Unitel Money (other) com multa.
await setRule(A, { late_fee_percent: 2, grace_days: 5, late_fee_scope: "electronic" });
inv = await invoice(A, 15000, "2026-09-10");
assert.equal((await pay(A, inv, 15000, "cash", "2026-10-20")).invoiceStatus, "paid");
assert.equal(Number((await row(inv)).p), 0);
inv = await invoice(A, 15000, "2026-09-10");
assert.equal((await pay(A, inv, 15000, "card", "2026-10-20")).invoiceStatus, "partially_paid");
assert.equal(Number((await row(inv)).p), 300);

// 5. Multa já aplicada por outro caminho (webhook): a tesouraria cobra-a, mesmo com
//    «só nos electrónicos» e pagando em numerário.
inv = await invoice(A, 1000, "2026-09-01", 100, 50);
assert.equal((await pay(A, inv, 900, "cash", "2026-09-02")).invoiceStatus, "partially_paid");
assert.equal((await pay(A, inv, 50, "cash", "2026-09-02")).invoiceStatus, "paid");

// 6. Outra escola não herda a regra.
inv = await invoice(B, 15000, "2026-09-10");
assert.equal((await pay(B, inv, 15000, "card", "2026-12-31")).invoiceStatus, "paid");

// 7. Só o dono a executa (corre dentro de register_payment).
const grants = await db.query(
  `select has_function_privilege('authenticated','private.late_fee_due(uuid,numeric,date,numeric,date,text)','EXECUTE') a,
          has_function_privilege('anon','private.late_fee_due(uuid,numeric,date,numeric,date,text)','EXECUTE') b`,
);
assert.deepEqual(grants.rows[0], { a: false, b: false });

// 8. A regra em TypeScript (late-fee.ts) e a da base dão o mesmo, caso a caso, incluindo
//    valores gravados como texto, fora dos limites ou inválidos.
const rules = [
  {},
  { late_fee_percent: 2, grace_days: 5 },
  { late_fee_percent: "2.5", grace_days: "3" },
  { late_fee_percent: " 3 ", grace_days: 0, late_fee_scope: "electronic" },
  { late_fee_percent: 150, grace_days: 90 },
  { late_fee_percent: -4, grace_days: -2 },
  { late_fee_percent: "abc", grace_days: "abc" },
  { late_fee_percent: 1.255, grace_days: 2.5 },
  { late_fee_percent: 7.77, grace_days: 1, late_fee_scope: "qualquer" },
  "lixo",
];
const amounts = [0.01, 0.05, 1, 333.33, 1234.56, 15000, 45000.5, 99999.99, 1000000];
const paidDays = [
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
  "2026-09-15",
  "2026-09-16",
  "2026-11-01",
];
const methods = ["cash", "bank_transfer", "card", "other"];
const parseRule = (value) => parseSettingsDomain("billing", value);
let compared = 0;
for (const value of rules) {
  await db.query(
    `insert into school_settings(school_id, domain, value) values ($1, 'billing', $2::jsonb)
     on conflict (school_id, domain) do update set value = excluded.value`,
    [B, JSON.stringify(value)],
  );
  const rule = parseRule(value);
  for (const amount of amounts) {
    for (const paidOn of paidDays) {
      for (const method of methods) {
        for (const penalty of [0, 10]) {
          const sql = Number(
            (
              await db.query(
                "select private.late_fee_due($1, $2, '2026-09-10'::date, $3, $4::date, $5) as f",
                [B, amount, penalty, paidOn, method],
              )
            ).rows[0].f,
          );
          const ts = lateFeeFor(
            { amount, due_date: "2026-09-10", penalty_amount: penalty },
            rule,
            paidOn,
            lateFeeChannelOfLedgerMethod(method),
          );
          assert.equal(ts, sql, JSON.stringify({ value, amount, paidOn, method, penalty }));
          compared += 1;
        }
      }
    }
  }
}

console.log(
  `multas: tesouraria aplica a regra uma vez, respeita o âmbito e a tolerância, desfaz-se com o pagamento recusado; TS e SQL iguais em ${compared} casos.`,
);
