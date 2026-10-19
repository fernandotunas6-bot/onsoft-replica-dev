// Ensaio local (PGlite) das migrações por aplicar 20261017140000_task_submissions.sql
// e 20261018120000_school_transport.sql (auditoria da PR #132). Sem produção.
// Uso: node tests/sql/same-school-references.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
// Só o que as chaves estrangeiras e os gatilhos pedem; papéis como no Supabase.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.schools (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.students (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL);
CREATE TABLE public.siga_class_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL);
CREATE FUNCTION public.siga_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE private.audit (table_name text, op text);
CREATE FUNCTION private.audit_row_change() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN INSERT INTO private.audit VALUES (TG_TABLE_NAME, TG_OP); RETURN NULL; END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
`);

for (const name of ["20261017140000_task_submissions", "20261018120000_school_transport"]) {
  const sql = read(`../../supabase/migrations/${name}.sql`);
  await db.exec(sql);
  await db.exec(sql); // idempotente
}

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rejects = async (sql, params, constraint) => {
  await assert.rejects(db.query(sql, params), (error) => {
    assert.equal(error.code, "23503", `${constraint}: ${error.message}`);
    assert.equal(error.constraint, constraint);
    return true;
  });
};

// Duas escolas, cada uma com aluno e tarefa.
const a = (await one("insert into schools default values returning id")).id;
const b = (await one("insert into schools default values returning id")).id;
const studentA = (await one("insert into students(school_id) values($1) returning id", [a])).id;
const studentB = (await one("insert into students(school_id) values($1) returning id", [b])).id;
const taskA = (await one("insert into siga_class_tasks(school_id) values($1) returning id", [a]))
  .id;
const taskB = (await one("insert into siga_class_tasks(school_id) values($1) returning id", [b]))
  .id;

// Só o servidor: anon e authenticated sem nada, mesmo com GRANT ALL antes.
for (const table of [
  "siga_task_submissions",
  "siga_transport_vehicles",
  "siga_transport_routes",
  "siga_transport_stops",
  "siga_transport_assignments",
  "siga_transport_day_status",
]) {
  for (const role of ["anon", "authenticated"]) {
    const { v } = await one("select has_table_privilege($1, $2, 'SELECT') as v", [
      role,
      `public.${table}`,
    ]);
    assert.equal(v, false, `${role} lê ${table}`);
  }
  const rls = await one(
    "select relrowsecurity, relforcerowsecurity from pg_class where oid = $1::regclass",
    [`public.${table}`],
  );
  assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true }, table);
}

// ── Entregas: tarefa e aluno têm de ser da escola da linha.
const submission = `insert into siga_task_submissions
  (school_id, task_id, student_id, storage_path, file_name, size_bytes)
  values ($1, $2, $3, 'escola/2026/10/submissions/u/x.pdf', 'x.pdf', 10)`;
await rejects(submission, [a, taskB, studentA], "task_submission_task_same_school");
await rejects(submission, [a, taskA, studentB], "task_submission_student_same_school");
await db.query(submission, [a, taskA, studentA]);
await rejects(
  "update siga_task_submissions set student_id = $1 where school_id = $2",
  [studentB, a],
  "task_submission_student_same_school",
);

// ── Transporte.
const vehicle = async (school) =>
  (
    await one(
      "insert into siga_transport_vehicles(school_id, plate, label, seats) values($1, $2, 'A', 10) returning id",
      [school, `LD-${school.slice(0, 4)}`],
    )
  ).id;
const vehicleA = await vehicle(a);
const vehicleB = await vehicle(b);

const route =
  "insert into siga_transport_routes(school_id, name, vehicle_id) values($1, $2, $3) returning id";
await rejects(route, [a, "R1", vehicleB], "transport_route_vehicle_same_school");
const routeA = (await one(route, [a, "R1", vehicleA])).id;
const routeB = (await one(route, [b, "R1", null])).id;
await rejects(
  "update siga_transport_routes set vehicle_id = $1 where id = $2",
  [vehicleB, routeA],
  "transport_route_vehicle_same_school",
);

const stop =
  "insert into siga_transport_stops(school_id, route_id, sequence, name) values($1, $2, $3, 'P') returning id";
await rejects(stop, [a, routeB, 1], "transport_route_same_school");
const stopA = (await one(stop, [a, routeA, 1])).id;
const stopB = (await one(stop, [b, routeB, 1])).id;
const routeA2 = (await one(route, [a, "R2", null])).id;

const assignment =
  "insert into siga_transport_assignments(school_id, student_id, route_id, stop_id) values($1, $2, $3, $4)";
await rejects(assignment, [a, studentB, routeA, stopA], "transport_assignment_student_same_school");
await rejects(assignment, [a, studentA, routeB, stopB], "transport_route_same_school");
await rejects(assignment, [a, studentA, routeA2, stopA], "transport_assignment_stop_same_route");
await rejects(assignment, [a, studentA, routeA, stopB], "transport_assignment_stop_same_route");
await db.query(assignment, [a, studentA, routeA, stopA]);

const day =
  "insert into siga_transport_day_status(school_id, route_id, service_date, status, delay_minutes) values($1, $2, '2026-10-19', 'delayed', 10)";
await rejects(day, [a, routeB], "transport_route_same_school");
await db.query(day, [a, routeA]);

// Paragem com aluno não se apaga; a auditoria regista as escritas.
await assert.rejects(db.query("delete from siga_transport_stops where id = $1", [stopA]));
const audited = await one(
  "select count(*)::int as n from private.audit where table_name like 'siga_transport_%'",
);
assert.ok(audited.n >= 6, "auditoria das tabelas do transporte");

console.log("same-school-references: 2 migrações x2, 13 referências de outra escola recusadas");
