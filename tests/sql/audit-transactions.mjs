const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(readFileSync(new URL("./audit-fixture.sql", import.meta.url), "utf8"));
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260930174857_audit_atomic_workflows_and_school_context.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);
const actor = "00000000-0000-0000-0000-000000000001";
const a = "00000000-0000-0000-0000-000000000002";
const b = "00000000-0000-0000-0000-000000000003";
const membership = "00000000-0000-0000-0000-000000000004";
const role = "00000000-0000-0000-0000-000000000005";
await db.exec(
  `INSERT INTO school_memberships(id,school_id,user_id,status) VALUES('${membership}','${a}','${actor}','active'); INSERT INTO roles(id,school_id,code,name) VALUES('${role}','${a}','owner','Owner'); INSERT INTO member_roles(school_id,membership_id,role_id) VALUES('${a}','${membership}','${role}');`,
);
await db.query(
  "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal','aal2',false)",
  [actor],
);
const count = async () => Number((await db.query("select count(*) as n from people")).rows[0].n);
const create = async (roles = [], docs = [], guardian = {}) =>
  db.query("select public.siga_create_person_bundle($1,$2,$3,$4,$5) as v", [
    a,
    JSON.stringify({ full_name: "Pessoa Teste", sex: "male" }),
    JSON.stringify(docs),
    roles,
    JSON.stringify(guardian),
  ]);
assert.equal((await db.query("select current_school_id() as id")).rows[0].id, a);
await db.query("select set_config('request.headers',$1,false)", [
  JSON.stringify({ "x-siga-school-id": b }),
]);
await assert.rejects(db.query("select current_school_id()"), /Sem vínculo/);
await db.query("select set_config('request.headers','{}',false)");
assert.equal((await db.query("select private.sga_app_role($1) as r", [b])).rows[0].r, "Utilizador");
await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
await assert.rejects(create(["professor"]), /Sem autorização/);
assert.equal(await count(), 0);
await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
await assert.rejects(
  create(["aluno"], [], { person_id: b, relationship: "guardian" }),
  /Encarregado inválido/,
);
assert.equal(await count(), 0);
await assert.rejects(
  create(["professor"], [{ document_type: "inventado", document_number: "123" }]),
  /Documento inválido/,
);
assert.equal(await count(), 0);
await create(
  ["professor", "aluno", "funcionario"],
  [{ document_type: "outro", document_number: "123" }],
);
assert.equal(await count(), 1);
assert.equal(Number((await db.query("select count(*) as n from teachers")).rows[0].n), 1);
assert.equal(Number((await db.query("select count(*) as n from students")).rows[0].n), 1);
await create(["professor"]);
assert.deepEqual(
  (await db.query("select employee_number from teachers order by employee_number")).rows.map(
    (r) => r.employee_number,
  ),
  ["DOC-000001", "DOC-000002"],
);
const invoice = (
  await db.query(
    "insert into finance_invoices(school_id,contract_id,fee_item_id,invoice_number,competence_month,amount,due_date,status,issued_by) values($1,$1,$1,'F-TEST',current_date,100,current_date,'paid',auth.uid()) returning id",
    [a],
  )
).rows[0].id;
const receipt = (
  await db.query(
    "insert into finance_receipts(school_id,invoice_id,receipt_number,amount,paid_on,payment_method,received_by) values($1,$2,'R-TEST',100,current_date,'cash',auth.uid()) returning id",
    [a, invoice],
  )
).rows[0].id;
await db.exec(
  "create function private.test_fail() returns trigger language plpgsql as $$ begin raise exception 'Test failure'; end $$; create trigger test_fail before update on finance_invoices for each row execute function private.test_fail();",
);
await assert.rejects(
  db.query("select siga_reverse_finance_receipt($1,$2,$3)", [a, receipt, "Correcção"]),
  /Test failure/,
);
assert.equal(
  (await db.query("select status from finance_receipts where id=$1", [receipt])).rows[0].status,
  "issued",
);
await db.exec("drop trigger test_fail on finance_invoices");
await db.query("select siga_reverse_finance_receipt($1,$2,$3)", [a, receipt, "Correcção"]);
assert.equal(
  (await db.query("select status from finance_invoices where id=$1", [invoice])).rows[0].status,
  "open",
);
await assert.rejects(
  db.query("select siga_reverse_finance_receipt($1,$2,$3)", [a, receipt, "Correcção"]),
  /já foi estornado/,
);
await assert.rejects(
  db.query("select siga_reverse_finance_receipt($1,$2,$3)", [b, receipt, "Correcção"]),
  /Sem autorização/,
);
await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
await assert.rejects(
  db.query("select siga_reverse_finance_receipt($1,$2,$3)", [a, receipt, "Correcção"]),
  /Sem autorização/,
);
console.log(
  "PASS: migration idempotence, school isolation, MFA, person rollback, student/teacher registration, teacher sequence, reversal rollback, duplicate reversal.",
);
await db.close();
