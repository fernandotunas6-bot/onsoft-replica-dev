import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.SIGA_SQL_TEST_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
await db.exec(read("./audit-fixture.sql"));
await db.exec(
  read("../../supabase/migrations/20260930174857_audit_atomic_workflows_and_school_context.sql"),
);
await db.exec(`ALTER TABLE staff_module_grants ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON staff_module_grants TO authenticated;
CREATE POLICY admin_scope ON staff_module_grants FOR ALL TO authenticated
USING (private.sga_app_role(school_id)='Administrador') WITH CHECK (private.sga_app_role(school_id)='Administrador');`);
const migration = read(
  "../../supabase/migrations/20261007083740_staff_module_grants_require_mfa.sql",
);
await db.exec(migration);
await db.exec(migration);
const actor = "00000000-0000-0000-0000-000000000001",
  a = "00000000-0000-0000-0000-000000000002",
  b = "00000000-0000-0000-0000-000000000003";
await db.exec(`INSERT INTO school_memberships(id,school_id,user_id,status) VALUES('${a}','${a}','${actor}','active');
INSERT INTO roles(id,school_id,code,name) VALUES('${b}','${a}','owner','Owner');
INSERT INTO member_roles(school_id,membership_id,role_id) VALUES('${a}','${a}','${b}');
INSERT INTO staff_module_grants(school_id,user_id,module_key,level) VALUES('${a}','${actor}','pessoas','Total');`);
await db.query(
  "SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal','aal1',false)",
  [actor],
);
await db.exec("SET ROLE authenticated");
assert.equal((await db.query("SELECT count(*)::int AS n FROM staff_module_grants")).rows[0].n, 1);
await assert.rejects(
  db.query(
    "INSERT INTO staff_module_grants(school_id,user_id,module_key,level) VALUES($1,$2,'pedagogica','Total')",
    [a, actor],
  ),
  /row-level security/,
);
assert.equal(
  (await db.query("UPDATE staff_module_grants SET level='Nenhum' RETURNING id")).rows.length,
  0,
);
assert.equal((await db.query("DELETE FROM staff_module_grants RETURNING id")).rows.length, 0);
assert.equal((await db.query("SELECT level FROM staff_module_grants")).rows[0].level, "Total");
await db.query("SELECT set_config('request.jwt.claim.aal','aal2',false)");
await db.query(
  "INSERT INTO staff_module_grants(school_id,user_id,module_key,level) VALUES($1,$2,'pedagogica','Total')",
  [a, actor],
);
assert.equal(
  (
    await db.query(
      "UPDATE staff_module_grants SET level='Leitura' WHERE module_key='pedagogica' RETURNING id",
    )
  ).rows.length,
  1,
);
await assert.rejects(
  db.query(
    "INSERT INTO staff_module_grants(school_id,user_id,module_key,level) VALUES($1,$2,'pessoas','Total')",
    [b, actor],
  ),
  /row-level security/,
);
assert.equal(
  (await db.query("DELETE FROM staff_module_grants WHERE module_key='pedagogica' RETURNING id"))
    .rows.length,
  1,
);
console.log(
  "PASS: idempotent SQL; AAL1 reads preserved, INSERT denied and UPDATE/DELETE affect zero rows; AAL2 allowed in own school; cross-school denied.",
);
await db.close();
