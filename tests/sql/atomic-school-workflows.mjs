import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env.SIGA_SQL_TEST_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
await db.exec(read("./audit-fixture.sql"));
await db.exec(
  read("../../supabase/migrations/20260930174857_audit_atomic_workflows_and_school_context.sql"),
);
// Colunas/tipos confirmados no catálogo de produção. FKs externas ao cenário omitidas.
await db.exec(`
CREATE TABLE public.schools(id uuid PRIMARY KEY,tenant_id uuid);
CREATE TABLE public.plans(id uuid PRIMARY KEY,max_students integer);
CREATE TABLE public.tenants(id uuid PRIMARY KEY,plan_id uuid,max_students integer);
CREATE TABLE public.academic_years(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,name text NOT NULL,starts_on date NOT NULL,ends_on date NOT NULL,status text NOT NULL DEFAULT 'draft',created_at timestamptz NOT NULL DEFAULT now(),created_by uuid,updated_by uuid,UNIQUE(school_id,name),CHECK(ends_on>starts_on));
CREATE UNIQUE INDEX academic_years_one_active_per_school ON academic_years(school_id) WHERE status='active';
CREATE TABLE public.class_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,academic_year_id uuid NOT NULL,capacity integer NOT NULL,status text NOT NULL DEFAULT 'active');
CREATE TABLE public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,academic_year_id uuid NOT NULL,class_group_id uuid NOT NULL,student_id uuid NOT NULL,enrollment_number text NOT NULL,enrolled_on date NOT NULL,status text NOT NULL DEFAULT 'active',created_by uuid NOT NULL,updated_by uuid NOT NULL);
CREATE UNIQUE INDEX enrollments_one_current_per_year_uidx ON enrollments(school_id,student_id,academic_year_id) WHERE status IN ('pending','active');
CREATE TABLE private.enrollment_number_sequences(school_id uuid PRIMARY KEY,next_number bigint DEFAULT 1,updated_at timestamptz DEFAULT now());
CREATE TABLE public.student_status_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,student_id uuid NOT NULL,previous_status text,new_status text NOT NULL,reason text,changed_by uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.audit_logs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,school_id uuid NOT NULL,actor_user_id uuid,action text NOT NULL,entity_type text NOT NULL,entity_id uuid,request_id uuid,metadata jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.is_school_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=$1 AND user_id=auth.uid() AND status='active') $$;
`);
const functions = read("../../supabase/migrations/20260908210000_capture_all_db_functions.sql");
const start = functions.indexOf("CREATE OR REPLACE FUNCTION private.enroll_student(");
assert.ok(start >= 0);
await db.exec(
  functions.slice(start, functions.indexOf("$function$;", start) + "$function$;".length),
);
const migration = read(
  "../../supabase/migrations/20261007083733_atomic_student_enrollment_and_academic_year.sql",
);
await db.exec(migration);
await db.exec(migration);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  a = id(2),
  b = id(3),
  yearA = id(6),
  yearB = id(7),
  group = id(8);
await db.query(
  `INSERT INTO schools(id) VALUES($1),($2);
`,
  [a, b],
);
await db.query(
  "INSERT INTO school_memberships(id,school_id,user_id,status) VALUES($1,$2,$3,'active')",
  [id(4), a, actor],
);
await db.query("INSERT INTO roles(id,school_id,code,name) VALUES($1,$2,'owner','Owner')", [
  id(5),
  a,
]);
await db.query("INSERT INTO member_roles(school_id,membership_id,role_id) VALUES($1,$2,$3)", [
  a,
  id(4),
  id(5),
]);
await db.query(
  "SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal','aal2',false)",
  [actor],
);
await db.query(
  "INSERT INTO academic_years(id,school_id,name,starts_on,ends_on,status) VALUES($1,$2,'AUDIT-A',current_date-30,current_date+30,'active'),($3,$2,'AUDIT-B',current_date-30,current_date+30,'draft')",
  [yearA, a, yearB],
);
await db.query(
  "INSERT INTO class_groups(id,school_id,academic_year_id,capacity) VALUES($1,$2,$3,1)",
  [group, a, yearA],
);
const counts = async () =>
  (
    await db.query(
      `SELECT (SELECT count(*)::int FROM people) AS people,(SELECT count(*)::int FROM students) AS students,(SELECT count(*)::int FROM enrollments) AS enrollments,(SELECT count(*)::int FROM student_status_history) AS history,(SELECT count(*)::int FROM audit_logs) AS audit`,
    )
  ).rows[0];
const enroll = (request = id(10), options = {}) =>
  db.query("SELECT siga_enroll_new_student_atomic($1,$2,$3,$4,$5,$6,$7) AS result", [
    options.school ?? a,
    request,
    JSON.stringify({
      full_name: options.name ?? "AUDIT Aluno",
      sex: "other",
      notes: options.notes ?? null,
    }),
    JSON.stringify(options.guardians ?? []),
    options.noClass ? null : group,
    options.noClass ? null : (options.year ?? yearA),
    options.date ?? null,
  ]);
await db.query("UPDATE class_groups SET capacity=0 WHERE id=$1", [group]);
await assert.rejects(enroll(), /capacidade/);
await assert.rejects(enroll(), /capacidade/);
assert.deepEqual(await counts(), { people: 0, students: 0, enrollments: 0, history: 0, audit: 0 });
await db.query("UPDATE class_groups SET capacity=1 WHERE id=$1", [group]);
await assert.rejects(enroll(id(11), { year: yearB }), /turma tem de pertencer/);
await assert.rejects(enroll(id(11), { school: b }), /Sem autorização/);
await db.query("SELECT set_config('request.jwt.claim.aal','aal1',false)");
await assert.rejects(enroll(), /2FA/);
await db.query("SELECT set_config('request.jwt.claim.aal','aal2',false)");
await assert.rejects(
  enroll(id(11), { guardians: [{ guardian_person_id: id(99), relationship: "guardian" }] }),
  /Encarregado inválido/,
);
const first = (await enroll()).rows[0].result;
assert.equal(first.status, "active");
assert.deepEqual((await enroll()).rows[0].result, first);
assert.deepEqual(await counts(), { people: 1, students: 1, enrollments: 1, history: 1, audit: 1 });
await assert.rejects(enroll(id(10), { name: "AUDIT Outro" }), /outros dados/);
await assert.rejects(enroll(id(12)), /capacidade/);
assert.equal((await counts()).people, 1);
const candidate = (await enroll(id(13), { noClass: true, notes: "AUDIT indicação da secretaria" }))
  .rows[0].result;
assert.equal(candidate.status, "applicant");
assert.equal(candidate.enrollment_number, null);
assert.match(
  (await db.query("SELECT reason FROM student_status_history WHERE student_id=$1", [candidate.id]))
    .rows[0].reason,
  /AUDIT indicação da secretaria/,
);
await db.query("INSERT INTO plans(id,max_students) VALUES($1,2)", [id(30)]);
await db.query("INSERT INTO tenants(id,plan_id) VALUES($1,$2)", [id(31), id(30)]);
await db.query("UPDATE schools SET tenant_id=$1 WHERE id=$2", [id(31), a]);
await assert.rejects(enroll(id(15), { noClass: true }), /Limite de alunos/);
assert.deepEqual((await enroll()).rows[0].result, first);
assert.equal((await counts()).students, 2);
await db.query("UPDATE tenants SET max_students=3 WHERE id=$1", [id(31)]);
await db.exec(
  "CREATE FUNCTION private.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDIT audit failure'; END $$; CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION private.fail_audit();",
);
const before = await counts();
await assert.rejects(enroll(id(14), { noClass: true }), /audit failure/);
assert.deepEqual(await counts(), before);
await db.exec("DROP TRIGGER fail_audit ON audit_logs");
const save = (year = yearB, school = a, name = null) =>
  db.query("SELECT siga_save_active_academic_year($1,$2,$3,$4,$5) AS result", [
    school,
    name ? null : year,
    name,
    name ? "2026-01-01" : null,
    name ? "2026-12-31" : null,
  ]);
await db.exec(
  "CREATE FUNCTION private.fail_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' AND NEW.name<>'AUDIT-A' THEN RAISE EXCEPTION 'AUDIT activation failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_activation BEFORE UPDATE ON academic_years FOR EACH ROW EXECUTE FUNCTION private.fail_activation();",
);
await assert.rejects(save(), /activation failure/);
assert.equal(
  (await db.query("SELECT status FROM academic_years WHERE id=$1", [yearA])).rows[0].status,
  "active",
);
await assert.rejects(save(null, a, "AUDIT-New"), /activation failure/);
assert.equal((await db.query("SELECT count(*)::int AS n FROM academic_years")).rows[0].n, 2);
await assert.rejects(save(yearB, b), /Sem autorização/);
await db.query("SELECT set_config('request.jwt.claim.aal','aal1',false)");
await assert.rejects(save(), /2FA/);
await db.query("SELECT set_config('request.jwt.claim.aal','aal2',false)");
await db.exec("DROP TRIGGER fail_activation ON academic_years");
assert.equal((await save()).rows[0].result.id, yearB);
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM academic_years WHERE status='active'")).rows[0].n,
  1,
);
const created = (await save(null, a, "AUDIT-New")).rows[0].result;
assert.equal(created.created, true);
const replay = (await save(null, a, "AUDIT-New")).rows[0].result;
assert.equal(replay.id, created.id);
assert.equal(replay.created, false);
await assert.rejects(
  db.query("SELECT siga_save_active_academic_year($1,NULL,$2,$3,$4)", [
    a,
    "AUDIT-New",
    "2026-02-01",
    "2026-12-31",
  ]),
  /Já existe um ano lectivo/,
);
assert.equal(
  (await db.query("SELECT starts_on::text AS date FROM academic_years WHERE id=$1", [created.id]))
    .rows[0].date,
  "2026-01-01",
);

assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM academic_years WHERE status='active'")).rows[0].n,
  1,
);
for (const fn of [
  "siga_enroll_new_student_atomic(uuid,uuid,jsonb,jsonb,uuid,uuid,date)",
  "siga_save_active_academic_year(uuid,uuid,text,date,date)",
]) {
  const privileges = (
    await db.query(
      "SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon,has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated",
      [fn],
    )
  ).rows[0];
  assert.equal(privileges.anon, false);
  assert.equal(privileges.authenticated, true);
}
console.log(
  "PASS: idempotent SQL; full-class rollback/retry; same-request replay; changed-request refusal; school/year/guardian isolation; MFA; audit rollback; candidate; failed activation/creation rollback; unique active year; ACL. PostgreSQL concurrency still requires staging.",
);
await db.close();
