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
for (const [file, names] of [
  ["20260906124500_hr_payroll_foundation.sql", ["hr_employments"]],
  ["20260906183000_hr_payroll_payment_orders.sql", ["hr_payment_destinations"]],
]) {
  const s = readFileSync(new URL("../../supabase/migrations/" + file, import.meta.url), "utf8");
  for (const name of names) {
    let ddl = s.match(
      new RegExp("CREATE TABLE(?: IF NOT EXISTS)? public\\." + name + " \\([\\s\\S]*?\\n\\);"),
    )[0];
    ddl = ddl.replace(
      / REFERENCES [\w.]+\([^)]*\)(?: ON DELETE (?:CASCADE|SET NULL|RESTRICT))?/g,
      "",
    );
    await db.exec(ddl);
  }
}
await db.exec(`CREATE UNIQUE INDEX primary_destination ON hr_payment_destinations(school_id,employment_id) WHERE is_primary AND active AND deleted_at IS NULL;
CREATE TABLE audit_logs(id bigint generated always as identity primary key,school_id uuid not null,actor_user_id uuid,action text not null,entity_type text not null,entity_id uuid,metadata jsonb not null,occurred_at timestamptz not null default now());`);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261001065856_hr_atomic_payment_destination.sql",
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
  employment = id(6);
await db.query(
  `insert into school_memberships(id,school_id,user_id,status) values($1,$2,$3,'active')`,
  [id(4), school, actor],
);
await db.query(`insert into roles(id,school_id,code,name) values($1,$2,'owner','Owner')`, [
  id(5),
  school,
]);
await db.query(`insert into member_roles(school_id,membership_id,role_id) values($1,$2,$3)`, [
  school,
  id(4),
  id(5),
]);
await db.query(
  `insert into hr_employments(id,school_id,person_id,employment_type,hire_date) values($1,$2,$3,'permanent','2026-01-01')`,
  [employment, school, id(7)],
);
await db.query(
  "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal','aal2',false)",
  [actor],
);
const data = {
  method: "transfer",
  beneficiaryName: "Pessoa Teste",
  bankName: "Banco",
  iban: "AO06004400006729503010102",
  accountNumber: "",
  destinationReference: "",
};
const save = (payload = data, target = school, emp = employment) =>
  db.query("select hr_upsert_payment_destination($1,$2,$3) as result", [
    target,
    emp,
    JSON.stringify(payload),
  ]);
const count = async (table) =>
  Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n);
await assert.rejects(save(data, other), /Sem autorização/);
await assert.rejects(save(data, school, id(8)), /Vínculo funcional/);
await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
await assert.rejects(save(), /Sem autorização/);
await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
await db.query(
  "insert into staff_module_grants(school_id,user_id,module_key,level) values($1,$2,'financeiro','Leitura')",
  [school, actor],
);
await assert.rejects(save(), /Sem autorização/);
await db.exec("delete from staff_module_grants");
await assert.rejects(
  save({ ...data, iban: "", accountNumber: "", destinationReference: "" }),
  /Dados do destino/,
);
await assert.rejects(save({ ...data, beneficiaryName: 42 }), /Campo de destino/);
await db.exec(`CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
CREATE TRIGGER audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit();`);
await assert.rejects(save(), /audit unavailable/);
assert.equal(await count("hr_payment_destinations"), 0);
await db.exec("drop trigger audit_failure on audit_logs");
const result = (await save()).rows[0].result;
assert.equal(result.saved, true);
assert.equal(await count("audit_logs"), 1);
assert.equal((await save()).rows[0].result.unchanged, true);
assert.equal(await count("audit_logs"), 1);
await db.exec(
  "CREATE TRIGGER audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit()",
);
await assert.rejects(save({ ...data, iban: "AO06004400006729503010999" }), /audit unavailable/);
assert.equal((await db.query("select iban from hr_payment_destinations")).rows[0].iban, data.iban);
await db.exec("drop trigger audit_failure on audit_logs");
await save({ ...data, iban: "", destinationReference: "PRIVATE-ACCOUNT-12345678" });
const logs = (await db.query("select metadata from audit_logs order by id")).rows;
const serialized = JSON.stringify(logs);
assert.ok(!serialized.includes(data.iban));
assert.ok(!serialized.includes("PRIVATE-ACCOUNT-12345678"));
assert.equal(logs[1].metadata.after.destination, "Referência ••••5678");
assert.equal(logs[1].metadata.before.destination, "IBAN ••••0102");
const short = (
  await db.query(
    "select private.hr_payment_destination_label(null,'1234',null,'transfer') as label",
  )
).rows[0].label;
assert.equal(short, "Conta ••••");
assert.equal(await count("hr_payment_destinations"), 1);
assert.equal(
  (
    await db.query(
      "select has_function_privilege('anon','public.hr_upsert_payment_destination(uuid,uuid,jsonb)','execute') as allowed",
    )
  ).rows[0].allowed,
  false,
);
console.log(
  "Destination: insert/update rollback, masking, retries, school, MFA, grants, validation and privileges passed.",
);
await db.close();
