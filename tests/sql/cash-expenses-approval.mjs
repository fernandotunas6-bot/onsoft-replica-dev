// Ensaio local (PGlite) de 20261025100000_cash_expenses_audit_and_approval.sql. Sem produção.
//   SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/cash-expenses-approval.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
// private.audit_row_change como capturada da produção.
const captura = read("../../supabase/migrations/20260908210000_capture_all_db_functions.sql");
const inicio = captura.indexOf("CREATE OR REPLACE FUNCTION private.audit_row_change()");
const auditoria = captura.slice(
  inicio,
  captura.indexOf("$function$;", inicio) + "$function$;".length,
);
assert.ok(inicio > 0 && auditoria.length > 500, "a captura de audit_row_change existe");

const db = new PGlite();
// Colunas de siga_cash_expenses e audit_logs como no retrato. O CHECK de status tem um
// nome que o repositório não conhece, como na produção; os outros dois CHECK — um que
// também fala de status — são do ensaio, para provar que a migração não lhes toca.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, actor_user_id uuid, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, request_id text, metadata jsonb, occurred_at timestamptz DEFAULT now());
CREATE TABLE public.siga_cash_expenses("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"document_number" text NOT NULL,"description" text NOT NULL,"category" text NOT NULL,"amount" numeric NOT NULL,"method" text DEFAULT 'cash',"reference" text,"occurred_at" date DEFAULT current_date,"status" text DEFAULT 'posted',"reversal_reason" text,"reversed_at" timestamptz,"reversed_by" uuid,"created_at" timestamptz DEFAULT now(),"created_by" uuid,"updated_at" timestamptz,"updated_by" uuid,
  CONSTRAINT siga_cash_expenses_status_check_prod CHECK (status IN ('posted', 'reversed')),
  CONSTRAINT ensaio_reversal_reason CHECK (status <> 'reversed' OR reversal_reason IS NOT NULL),
  CONSTRAINT ensaio_amount_positive CHECK (amount > 0));
`);
await db.exec(auditoria);

const migracao = read(
  "../../supabase/migrations/20261025100000_cash_expenses_audit_and_approval.sql",
);
const ESCOLA = "00000000-0000-4000-8000-00000000000a";
const OPERADOR = "00000000-0000-4000-8000-0000000000a1";
const ADMIN = "00000000-0000-4000-8000-0000000000a2";
await db.exec(`INSERT INTO auth.users VALUES ('${OPERADOR}'), ('${ADMIN}')`);
const um = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const despesa = (estado) =>
  um(
    `INSERT INTO public.siga_cash_expenses (school_id, document_number, description, category, amount, status, created_by)
     VALUES ($1, 'DSP-' || gen_random_uuid(), 'Gerador', 'Equipamento', 75000, $2, $3) RETURNING id`,
    [ESCOLA, estado, OPERADOR],
  );
const restricoes = async () =>
  (
    await db.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'public.siga_cash_expenses'::regclass AND contype = 'c' ORDER BY 1",
    )
  ).rows.map((r) => r.conname);

// Antes: pending_approval é recusado, como na produção.
await assert.rejects(despesa("pending_approval"), /siga_cash_expenses_status_check_prod/);

for (let corrida = 0; corrida < 2; corrida++) await db.exec(migracao);

assert.deepEqual(await restricoes(), [
  "ensaio_amount_positive",
  "ensaio_reversal_reason",
  "siga_cash_expenses_status_check",
]);
// A lista nova aceita os três estados e só esses.
const pendente = await despesa("pending_approval");
await despesa("posted");
await assert.rejects(despesa("approved"), /siga_cash_expenses_status_check/);
// Os outros CHECK continuam a valer.
await assert.rejects(
  db.query("UPDATE public.siga_cash_expenses SET status = 'reversed' WHERE id = $1", [pendente.id]),
  /ensaio_reversal_reason/,
);

// Aprovação: quem e quando; a FK recusa um utilizador que não existe.
await db.query(
  "UPDATE public.siga_cash_expenses SET status = 'posted', approved_by = $2, approved_at = now(), updated_by = $2 WHERE id = $1",
  [pendente.id, ADMIN],
);
await assert.rejects(
  db.query("UPDATE public.siga_cash_expenses SET approved_by = gen_random_uuid() WHERE id = $1", [
    pendente.id,
  ]),
  /foreign key/,
);

// Auditoria: cada escrita fica, com a operação e os campos alterados; o gatilho existe uma vez.
await db.query(
  "UPDATE public.siga_cash_expenses SET status = 'reversed', reversal_reason = 'Duplicada', reversed_by = $2, reversed_at = now() WHERE id = $1",
  [pendente.id, ADMIN],
);
await db.query("DELETE FROM public.siga_cash_expenses WHERE id = $1", [pendente.id]);
const rasto = (
  await db.query(
    "SELECT action, metadata->'changed_fields' AS campos FROM public.audit_logs WHERE entity_id = $1 ORDER BY occurred_at, action",
    [pendente.id],
  )
).rows;
assert.deepEqual(
  rasto.map((r) => r.action),
  [
    "siga_cash_expenses.insert",
    "siga_cash_expenses.update",
    "siga_cash_expenses.update",
    "siga_cash_expenses.delete",
  ],
  "inserir, aprovar, estornar e apagar ficam no registo",
);
const campos = rasto.filter((r) => r.action.endsWith("update")).map((r) => r.campos);
assert.ok(campos.some((c) => c.includes("approved_by") && c.includes("status")));
assert.ok(campos.some((c) => c.includes("reversal_reason") && c.includes("reversed_by")));
const gatilhos = await um(
  "SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'public.siga_cash_expenses'::regclass AND tgname = 'audit_siga_cash_expenses_change'",
);
assert.equal(gatilhos.n, 1);

console.log(
  "cash-expenses-approval: lista de estados trocada sem tocar nos outros CHECK, aprovação e auditoria — ok",
);
