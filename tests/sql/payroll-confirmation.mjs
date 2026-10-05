import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.SIGA_SQL_TEST_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
await db.exec(readFileSync(new URL("./audit-fixture.sql", import.meta.url), "utf8"));
await db.exec(
  readFileSync(
    new URL(
      "../../supabase/migrations/20260930174857_audit_atomic_workflows_and_school_context.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
// Production table definitions; unrelated foreign-key targets are omitted locally.
for (const [file, names] of [
  ["20260906124500_hr_payroll_foundation.sql", ["hr_payroll_runs", "hr_payroll_items"]],
  [
    "20260906183000_hr_payroll_payment_orders.sql",
    ["hr_payment_settings", "hr_payroll_payment_batches", "hr_payroll_payment_items"],
  ],
]) {
  const source = readFileSync(
    new URL("../../supabase/migrations/" + file, import.meta.url),
    "utf8",
  );
  for (const name of names) {
    let ddl = source.match(
      new RegExp("CREATE TABLE(?: IF NOT EXISTS)? public\\." + name + " \\([\\s\\S]*?\\n\\);"),
    )[0];
    ddl = ddl.replace(
      / REFERENCES [\w.]+\([^)]*\)(?: ON DELETE (?:CASCADE|SET NULL|RESTRICT))?/g,
      "",
    );
    if (name === "hr_payroll_items")
      ddl = ddl.replace("'approved','paid'", "'approved','processing','paid'");
    await db.exec(ddl);
  }
}
await db.exec(`ALTER TABLE hr_payroll_payment_items ADD COLUMN cash_expense_id uuid;
CREATE TABLE siga_cash_expenses(id uuid primary key default gen_random_uuid(),school_id uuid not null,
 document_number text not null,description text not null,category text not null,amount numeric not null check(amount>0),
 method text not null,reference text,occurred_at timestamptz not null,status text not null,
 reversal_reason text,reversed_at timestamptz,reversed_by uuid,created_at timestamptz default now(),
 created_by uuid,updated_at timestamptz default now(),updated_by uuid,unique(school_id,document_number));
CREATE TABLE audit_logs(id uuid primary key default gen_random_uuid(),school_id uuid not null,actor_user_id uuid,
 action text not null,entity_type text not null,entity_id uuid,request_id text,metadata jsonb,occurred_at timestamptz default now());
-- Na produção, entrar em «approved» corre as validações da aprovação (hr_guard_payroll_*),
-- que exigem todas as linhas aprovadas; aqui basta recusar a entrada.
CREATE FUNCTION approval_guards() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='approved' AND OLD.status<>'approved' THEN RAISE EXCEPTION 'approval guards: Item salarial não está aprovado'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER approval_guards BEFORE UPDATE ON hr_payroll_runs FOR EACH ROW EXECUTE FUNCTION approval_guards();`);
const locked = readFileSync(
  new URL(
    "../../supabase/migrations/20260906185000_hr_payroll_locked_status_transitions.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(
  locked.slice(locked.indexOf("CREATE OR REPLACE FUNCTION"), locked.indexOf("-- Ao autorizar")),
);
await db.exec(
  `CREATE TRIGGER lock_money BEFORE UPDATE ON hr_payroll_items FOR EACH ROW EXECUTE FUNCTION hr_block_locked_payroll_item_mutation();`,
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260930192241_hr_atomic_payment_confirmation.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  school = id(2),
  other = id(3),
  run = id(6),
  batch = id(7);
await db.query(
  `insert into school_memberships(id,school_id,user_id,status) values($1,$2,$3,'active');`,
  [id(4), school, actor],
);
await db.query(`insert into roles(id,school_id,code,name) values($1,$2,'owner','Owner')`, [
  id(5),
  school,
]);
await db.query("insert into member_roles(school_id,membership_id,role_id) values($1,$2,$3)", [
  school,
  id(4),
  id(5),
]);
await db.query(
  "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal','aal2',false)",
  [actor],
);
await db.query(
  `insert into hr_payroll_runs(id,school_id,competence_year,competence_month,period_start,period_end,status) values($1,$2,2026,9,'2026-09-01','2026-09-30','processing')`,
  [run, school],
);
await db.query(
  `insert into hr_payroll_payment_batches(id,school_id,payroll_run_id,batch_number,status,prepared_by,authorized_by,authorized_at) values($1,$2,$3,'SAL-001','authorized',$4,$5,now())`,
  [batch, school, run, other, actor],
);
for (let n = 10; n < 12; n++) {
  await db.query(
    `insert into hr_payroll_items(id,school_id,payroll_run_id,employment_id,net_amount_kz,status) values($1,$2,$3,$4,100,'processing')`,
    [id(n), school, run, id(n + 20)],
  );
  await db.query(
    `insert into hr_payroll_payment_items(id,school_id,batch_id,payroll_item_id,employment_id,beneficiary_name,amount_kz,status) values($1,$2,$3,$4,$5,'Teste',100,'authorized')`,
    [id(n + 2), school, batch, id(n), id(n + 20)],
  );
}
const confirm = (item = 12, result = "paid", ref = "REF-001", target = school) =>
  db.query("select hr_confirm_payroll_payment_item($1,$2,$3,$4,$5) as result", [
    target,
    id(item),
    result,
    ref,
    result === "failed" ? "Falha documentada" : null,
  ]);
const cashCount = async () =>
  Number((await db.query("select count(*) as n from siga_cash_expenses")).rows[0].n);
await assert.rejects(confirm(12, "paid", "REF-001", other), /Sem autorização/);
await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
await assert.rejects(confirm(), /Sem autorização/);
await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
await db.query(
  "insert into staff_module_grants(school_id,user_id,module_key,level) values($1,$2,'financeiro','Leitura')",
  [school, actor],
);
await assert.rejects(confirm(), /Sem autorização/);
await db.exec("delete from staff_module_grants");
await db.query(
  "insert into hr_payment_settings(school_id,allow_manual_confirmation) values($1,false)",
  [school],
);
await assert.rejects(confirm(), /manual desactivada/);
await db.exec("delete from hr_payment_settings");
await confirm(12, "failed");
assert.equal(await cashCount(), 0);
// Inject failure after the cash insert: entire aggregate must roll back.
await db.exec(`CREATE FUNCTION reject_paid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='paid' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fail_payment BEFORE UPDATE ON hr_payroll_payment_items FOR EACH ROW EXECUTE FUNCTION reject_paid();`);
await assert.rejects(confirm(), /injected failure/);
assert.equal(await cashCount(), 0);
assert.equal(
  (await db.query("select status from hr_payroll_payment_items where id=$1", [id(12)])).rows[0]
    .status,
  "failed",
);
await db.exec("drop trigger fail_payment on hr_payroll_payment_items");
await db.query("update hr_payroll_payment_items set amount_kz=101 where id=$1", [id(12)]);
await assert.rejects(confirm(), /valor incompatível/);
assert.equal(await cashCount(), 0);
await db.query("update hr_payroll_payment_items set amount_kz=100 where id=$1", [id(12)]);
const first = (await confirm()).rows[0].result;
assert.equal(first.paid, true);
assert.equal(first.batchCompleted, false);
assert.equal(await cashCount(), 1);
assert.equal((await confirm()).rows[0].result.idempotent, true);
assert.equal(await cashCount(), 1);
await assert.rejects(confirm(12, "paid", "OTHER-REF"), /já confirmado/);
await assert.rejects(confirm(12, "failed"), /já confirmado/);
assert.equal((await db.query("select status from hr_payroll_runs")).rows[0].status, "processing");
const last = (await confirm(13, "paid", "REF-002")).rows[0].result;
assert.equal(last.batchCompleted, true);
assert.equal((await db.query("select status from hr_payroll_runs")).rows[0].status, "paid");
assert.equal(await cashCount(), 2);
assert.equal((await confirm(13, "paid", "REF-002")).rows[0].result.idempotent, true);
// Anular (hr_reverse_payroll_payment) e voltar a pagar. A anulação aplicada na produção
// (20261004130000) põe a linha da folha em «approved» e o trigger de bloqueio recusa;
// 20261005050000 corrige-a. A saída anulada mantém o número, que é único por escola, e a
// confirmação escolhe o seguinte livre (20261005040000).
const migrationFile = (name) =>
  readFileSync(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8");
// Sonda de docs/agents/SIGA_confirmar_migracoes.sql (as tabelas que ela consulta pelo nome).
await db.exec(`CREATE TABLE IF NOT EXISTS siga_direct_messages(id uuid primary key);
CREATE TABLE IF NOT EXISTS student_academic_history(id uuid primary key);
CREATE TABLE IF NOT EXISTS import_table_specs(table_schema text,table_name text,direct_import_policy text);`);
const probe = async () =>
  Object.fromEntries(
    (
      await db.exec(
        readFileSync(
          new URL("../../docs/agents/SIGA_confirmar_migracoes.sql", import.meta.url),
          "utf8",
        ),
      )
    )
      .at(-1)
      .rows.filter(
        (r) => r.migracao.startsWith("2026100504") || r.migracao.startsWith("2026100505"),
      )
      .map((r) => [r.migracao.slice(0, 14), r.estado]),
  );
assert.deepEqual(await probe(), { 20261005040000: "EM FALTA", 20261005050000: "EM FALTA" });
await db.exec(migrationFile("20261004130000_hr_reverse_payroll_payment.sql"));
const freeNumber = migrationFile("20261005040000_hr_confirm_payment_free_expense_number.sql");
await db.exec(freeNumber);
await db.exec(freeNumber);
const reverseItem = (item, next, reason = "IBAN errado no primeiro pagamento") =>
  db.query("select private.hr_reverse_payroll_payment($1,$2,$3,$4,$5) as result", [
    school,
    id(item),
    actor,
    reason,
    next,
  ]);
const statusOf = async (table, rowId) =>
  (await db.query(`select status from ${table} where id=$1`, [rowId])).rows[0].status;
await assert.rejects(
  reverseItem(12, "repay"),
  /Invalid locked payroll item status transition: paid -> approved/,
);
assert.equal(await statusOf("hr_payroll_payment_items", id(12)), "paid");
const lockFix = migrationFile("20261005050000_hr_reverse_payroll_payment_lock_states.sql");
await db.exec(lockFix);
await db.exec(lockFix);
assert.deepEqual(await probe(), { 20261005040000: "aplicada", 20261005050000: "aplicada" });
// Fora da anulação a linha paga (id 10, do pagamento 12) continua bloqueada, com ou sem
// a marca de outra linha.
await assert.rejects(
  db.query("update hr_payroll_items set status='processing' where id=$1", [id(10)]),
  /Invalid locked payroll item status transition: paid -> processing/,
);
await assert.rejects(
  db.transaction(async (tx) => {
    await tx.query("select set_config('siga.hr_payroll_reversal',$1,true)", [id(11)]);
    await tx.query("update hr_payroll_items set status='cancelled' where id=$1", [id(10)]);
  }),
  /Invalid locked payroll item status transition: paid -> cancelled/,
);
const numbers = async () =>
  (
    await db.query(
      "select document_number, status from siga_cash_expenses where document_number like $1 order by document_number",
      [`SAL-001-${id(12)}%`],
    )
  ).rows;
const reversed = (await reverseItem(12, "repay")).rows[0].result;
assert.deepEqual(
  { item: reversed.itemStatus, batch: reversed.batchStatus },
  { item: "authorized", batch: "partial" },
);
assert.equal(await statusOf("hr_payroll_items", id(10)), "processing");
assert.equal(await statusOf("hr_payroll_runs", run), "processing");
assert.equal(
  (await db.query("select paid_at from hr_payroll_runs where id=$1", [run])).rows[0].paid_at,
  null,
);
const repaid = (await confirm(12, "paid", "REF-003")).rows[0].result;
assert.equal(repaid.paid, true);
assert.equal(repaid.batchCompleted, true);
assert.equal(await statusOf("hr_payroll_runs", run), "paid");
assert.deepEqual(
  (await numbers()).map((row) => [row.document_number, row.status]),
  [
    [`SAL-001-${id(12)}`, "reversed"],
    [`SAL-001-${id(12)}-2`, "posted"],
  ],
);
// Uma segunda anulação e novo pagamento levam o -3.
await reverseItem(12, "repay", "Referência bancária errada");
await confirm(12, "paid", "REF-004");
assert.equal((await numbers()).at(-1).document_number, `SAL-001-${id(12)}-3`);
// Cancelar (o salário não era devido): a linha fica cancelada e, sem nada por pagar,
// a ordem fica concluída e a folha continua paga.
const cancelled = (await reverseItem(13, "cancel", "Salário não era devido")).rows[0].result;
assert.deepEqual(
  { item: cancelled.itemStatus, batch: cancelled.batchStatus },
  { item: "cancelled", batch: "completed" },
);
assert.equal(await statusOf("hr_payroll_items", id(11)), "cancelled");
assert.equal(await statusOf("hr_payroll_runs", run), "paid");
assert.equal(
  (
    await db.query("select count(*)::int as n from audit_logs where action=$1", [
      "hr.payroll_payment.reversed",
    ])
  ).rows[0].n,
  3,
);
const privileges = (
  await db.query(`select has_function_privilege('anon','public.hr_confirm_payroll_payment_item(uuid,uuid,text,text,text)','execute') as anon,
 has_function_privilege('authenticated','public.hr_confirm_payroll_payment_item(uuid,uuid,text,text,text)','execute') as authenticated`)
).rows[0];
assert.equal(privileges.anon, false);
assert.equal(privileges.authenticated, true);
console.log(
  "Payroll confirmation: rollback, isolation, MFA, module grants, manual policy, amounts, failures, replay, completion, reversal (pay again -2/-3, cancel) and the payroll lock passed.",
);
await db.close();
