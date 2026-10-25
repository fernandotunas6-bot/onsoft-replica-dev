// Ensaio local (PGlite) de docs/agents/SIGA_aplicar_financeiro_2026.sql e do
// SIGA_verificar_financeiro_2026.sql. Sem produção.
//   SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/finance-2026-bundle.mjs
//
// O pacote junta as cinco migrações financeiras de 24–25/10 numa transacção, para o
// SQL Editor. Aqui: a verificação dá false antes, o pacote aplica, a verificação dá
// true, o histórico regista as cinco versões, e uma segunda corrida é recusada sem mudar
// nada. As regras de cada migração têm o seu ensaio (payment-integrity, cash-sessions,
// one-tuition-per-month, cash-expenses-approval).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const captura = read("../../supabase/migrations/20260908210000_capture_all_db_functions.sql");
const inicio = captura.indexOf("CREATE OR REPLACE FUNCTION private.audit_row_change()");
const auditoria = captura.slice(
  inicio,
  captura.indexOf("$function$;", inicio) + "$function$;".length,
);

const db = new PGlite();
// As tabelas que as cinco tocam, com as colunas do retrato; permissões simuladas.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text);
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.has_permission(s uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.sga_app_role(s uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'Tesouraria' $$;
CREATE FUNCTION private.late_fee_due(s uuid, a numeric, d date, p numeric, o date, m text) RETURNS numeric
  LANGUAGE sql STABLE AS $$ SELECT 0::numeric $$;
CREATE FUNCTION private.next_document_number(s uuid, t text) RETURNS text
  LANGUAGE sql AS $$ SELECT 'REC-' || gen_random_uuid() $$;
CREATE TABLE public.schools(id uuid PRIMARY KEY);
CREATE TABLE public.staff_module_grants(school_id uuid, user_id uuid, module_key text, level text);
CREATE TABLE public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, actor_user_id uuid, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, request_id text, metadata jsonb, occurred_at timestamptz DEFAULT now());
CREATE TABLE public.fee_items("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"school_id" uuid NOT NULL,"kind" text NOT NULL);
CREATE TABLE public.finance_invoices("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"contract_id" uuid NOT NULL,"fee_item_id" uuid NOT NULL,"invoice_number" text NOT NULL,"competence_month" date,"amount" numeric NOT NULL,"discount_amount" numeric DEFAULT 0 NOT NULL,"due_date" date NOT NULL,"status" text DEFAULT 'open'::text NOT NULL,"issued_by" uuid NOT NULL,"cancelled_at" timestamp with time zone,"cancelled_by" uuid,"cancellation_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"penalty_amount" numeric DEFAULT 0 NOT NULL);
CREATE TABLE public.finance_receipts("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"invoice_id" uuid NOT NULL,"receipt_number" text NOT NULL,"amount" numeric NOT NULL,"paid_on" date NOT NULL,"payment_method" text NOT NULL,"received_by" uuid NOT NULL,"status" text DEFAULT 'issued'::text NOT NULL,"reversed_at" timestamp with time zone,"reversed_by" uuid,"reversal_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"external_id" text);
CREATE TABLE public.siga_cash_expenses("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"document_number" text NOT NULL,"description" text NOT NULL,"category" text NOT NULL,"amount" numeric NOT NULL,"method" text DEFAULT 'cash',"reference" text,"occurred_at" date DEFAULT current_date,"status" text DEFAULT 'posted',"reversal_reason" text,"reversed_at" timestamptz,"reversed_by" uuid,"created_at" timestamptz DEFAULT now(),"created_by" uuid,"updated_at" timestamptz,"updated_by" uuid,
  CONSTRAINT siga_cash_expenses_status_check_prod CHECK (status IN ('posted', 'reversed')));
CREATE FUNCTION private.register_payment(a uuid, b uuid, c numeric, d text, e date DEFAULT CURRENT_DATE) RETURNS jsonb
  LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.register_payment(school_id uuid, invoice_id uuid, amount numeric, payment_method text, paid_on date DEFAULT CURRENT_DATE) RETURNS jsonb
  LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION private.reverse_finance_receipt(p_school_id uuid, p_receipt_id uuid, p_reason text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
`);
await db.exec(auditoria);

const verificar = read("../../docs/agents/SIGA_verificar_financeiro_2026.sql");
const pacote = read("../../docs/agents/SIGA_aplicar_financeiro_2026.sql");
const estado = async () =>
  (await db.exec(verificar))[0].rows.map((r) => [r.migracao.slice(0, 14), r.aplicada]);
const VERSOES = [
  "20261024090000",
  "20261024100000",
  "20261024110000",
  "20261025090000",
  "20261025100000",
];

assert.deepEqual(
  await estado(),
  VERSOES.map((v) => [v, false]),
  "antes, nenhuma aplicada",
);
const [, restricoes] = await db.exec(verificar);
assert.deepEqual(
  restricoes.rows.map((r) => [r.conname, r.troca]),
  [["siga_cash_expenses_status_check_prod", true]],
);

// O pacote contém cada migração tal e qual o ficheiro deste ramo, quando ele existe aqui.
for (const v of [
  "20261024090000_reverse_receipt_counts_late_fee",
  "20261024100000_register_payment_idempotency_key",
]) {
  assert.ok(
    pacote.includes(read(`../../supabase/migrations/${v}.sql`).trimEnd()),
    `${v} tal e qual`,
  );
}

const resultados = await db.exec(pacote);
assert.deepEqual(
  resultados.at(-1).rows.map((r) => [r.migracao.slice(0, 14), r.aplicada]),
  VERSOES.map((v) => [v, true]),
  "a confirmação do próprio pacote dá true",
);
assert.deepEqual(
  await estado(),
  VERSOES.map((v) => [v, true]),
);
const historico = await db.query(
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
);
assert.deepEqual(
  historico.rows.map((r) => r.version),
  VERSOES,
);
const [, depois] = await db.exec(verificar);
assert.deepEqual(
  depois.rows.map((r) => [r.conname, r.troca]),
  [["siga_cash_expenses_status_check", true]],
);

// Segunda corrida: recusada pela guarda, e a transacção desfaz-se sem deixar nada a meio.
await assert.rejects(db.exec(pacote), /já está aplicada/);
await db.exec("ROLLBACK");
assert.deepEqual(
  await estado(),
  VERSOES.map((v) => [v, true]),
);
const triggers = await db.query(
  "SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'audit_siga_cash_expenses_change'",
);
assert.equal(triggers.rows[0].n, 1);

console.log(
  "finance-2026-bundle: verificar → aplicar numa transacção → confirmar; segunda corrida recusada — ok",
);
