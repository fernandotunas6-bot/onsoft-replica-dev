// Ensaio local (PGlite) de 20261018120000_hr_payroll_zero_net_settled.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/payroll-zero-net.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (file) =>
  readFileSync(new URL("../../supabase/migrations/" + file, import.meta.url), "utf8");
const migration = read("20261018120000_hr_payroll_zero_net_settled.sql");
// O gatilho de bloqueio como está no repositório (última versão).
const lock = read("20261005050000_hr_reverse_payroll_payment_lock_states.sql").match(
  /CREATE OR REPLACE FUNCTION public\.hr_block_locked_payroll_item_mutation\(\)[\s\S]*?\n\$\$;/,
)[0];

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE public.hr_payroll_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  status text NOT NULL, paid_at timestamptz);
CREATE TABLE public.hr_payroll_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  payroll_run_id uuid NOT NULL, employment_id uuid, contract_id uuid, base_amount_kz numeric,
  hourly_amount_kz numeric, allowances_kz numeric, bonuses_kz numeric, overtime_kz numeric,
  deductions_kz numeric, gross_amount_kz numeric, net_amount_kz numeric, calculation_details jsonb,
  status text NOT NULL);
${lock}
CREATE TRIGGER hr_payroll_items_lock_after_approval BEFORE INSERT OR UPDATE OR DELETE
  ON public.hr_payroll_items FOR EACH ROW EXECUTE FUNCTION public.hr_block_locked_payroll_item_mutation();
`);

const S = "00000000-0000-0000-0000-000000000001";
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const status = async (id) =>
  (await one(`SELECT status FROM public.hr_payroll_items WHERE id = $1`, [id])).status;

// Folha antiga, já presa: um item pago, um de líquido zero em processing.
const stuck = (
  await one(
    `INSERT INTO public.hr_payroll_runs (school_id, status) VALUES ($1,'draft') RETURNING id`,
    [S],
  )
).id;
const stuckPaid = (
  await one(
    `INSERT INTO public.hr_payroll_items (school_id, payroll_run_id, net_amount_kz, status)
     VALUES ($1,$2,50000,'paid') RETURNING id`,
    [S, stuck],
  )
).id;
const stuckZero = (
  await one(
    `INSERT INTO public.hr_payroll_items (school_id, payroll_run_id, net_amount_kz, status)
     VALUES ($1,$2,0,'processing') RETURNING id`,
    [S, stuck],
  )
).id;
await db.exec(`UPDATE public.hr_payroll_runs SET status = 'processing' WHERE id = '${stuck}'`);
// Folha ainda por pagar: um item com líquido > 0 em processing não pode ser tocado.
const open = (
  await one(
    `INSERT INTO public.hr_payroll_runs (school_id, status) VALUES ($1,'draft') RETURNING id`,
    [S],
  )
).id;
const openDue = (
  await one(
    `INSERT INTO public.hr_payroll_items (school_id, payroll_run_id, net_amount_kz, status)
     VALUES ($1,$2,80000,'processing') RETURNING id`,
    [S, open],
  )
).id;
await db.exec(`UPDATE public.hr_payroll_runs SET status = 'processing' WHERE id = '${open}'`);

await db.exec(migration);
await db.exec(migration);

assert.equal(await status(stuckZero), "paid", "o item preso de líquido zero fica liquidado");
assert.equal(await status(stuckPaid), "paid");
assert.equal(
  (await one(`SELECT status, paid_at FROM public.hr_payroll_runs WHERE id = $1`, [stuck])).status,
  "paid",
  "a folha que só esperava por ele fecha",
);
assert.equal(await status(openDue), "processing", "um item com valor a pagar não muda");
assert.equal(
  (await one(`SELECT status FROM public.hr_payroll_runs WHERE id = $1`, [open])).status,
  "processing",
);

// Autorização nova: approved → processing; o de líquido zero vai directo a paid.
const run = (
  await one(
    `INSERT INTO public.hr_payroll_runs (school_id, status) VALUES ($1,'draft') RETURNING id`,
    [S],
  )
).id;
const ids = {};
for (const [k, net] of [
  ["due", 120000],
  ["zero", 0],
  ["neg", -10],
]) {
  ids[k] = (
    await one(
      `INSERT INTO public.hr_payroll_items (school_id, payroll_run_id, net_amount_kz, status)
       VALUES ($1,$2,$3,'approved') RETURNING id`,
      [S, run, net],
    )
  ).id;
}
await db.exec(`UPDATE public.hr_payroll_runs SET status = 'approved' WHERE id = '${run}'`);
await db.exec(
  `UPDATE public.hr_payroll_items SET status = 'processing' WHERE payroll_run_id = '${run}' AND status = 'approved'`,
);
assert.equal(await status(ids.due), "processing");
assert.equal(await status(ids.zero), "paid");
assert.equal(await status(ids.neg), "paid");

// Os valores continuam imutáveis e as transições proibidas continuam proibidas.
await assert.rejects(
  db.query(`UPDATE public.hr_payroll_items SET net_amount_kz = 1 WHERE id = $1`, [ids.zero]),
  /immutable/,
);
await assert.rejects(
  db.query(`UPDATE public.hr_payroll_items SET status = 'approved' WHERE id = $1`, [ids.zero]),
  /Invalid locked payroll item status transition/,
);
// A folha fecha quando o único item com valor é pago (como em hr_confirm_payroll_payment_item).
await db.exec(`UPDATE public.hr_payroll_items SET status = 'paid' WHERE id = '${ids.due}'`);
assert.equal(
  (
    await one(
      `SELECT count(*)::int AS n FROM public.hr_payroll_items
       WHERE payroll_run_id = $1 AND status NOT IN ('paid','cancelled')`,
      [run],
    )
  ).n,
  0,
);

console.log("payroll-zero-net: ok");
