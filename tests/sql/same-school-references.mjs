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
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  CONSTRAINT students_school_id_id_key UNIQUE (school_id, id)
);
CREATE TABLE public.siga_class_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL);
-- Subconjunto do esquema real: pessoas autorizadas e notificações in-app.
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid UNIQUE
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  channel text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL CHECK (title <> '__TEST_FAIL_NOTIFICATION__'),
  body text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL
);
CREATE FUNCTION public.siga_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE private.audit (table_name text, op text);
CREATE FUNCTION private.audit_row_change() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN INSERT INTO private.audit VALUES (TG_TABLE_NAME, TG_OP); RETURN NULL; END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
`);

for (const [name, manualPackage] of [
  ["20261017140000_task_submissions", "SIGA_aplicar_entregas_pdf.sql"],
  ["20261018120000_school_transport", "SIGA_aplicar_transporte.sql"],
]) {
  const sql = read(`../../supabase/migrations/${name}.sql`);
  const packageSql = read(`../../docs/agents/${manualPackage}`);
  assert.ok(
    packageSql.includes(sql.trim()),
    `${manualPackage}: a aplicação manual deve incluir a migração completa`,
  );
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
// A mesma localização do Storage não pode pertencer a duas tarefas diferentes.
const taskA2 = (await one("insert into siga_class_tasks(school_id) values($1) returning id", [a]))
  .id;
await assert.rejects(db.query(submission, [a, taskA2, studentA]), (error) => {
  assert.equal(error.code, "23505");
  assert.equal(error.constraint, "siga_task_submissions_storage_path_unique_idx");
  return true;
});
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
// Contas fictícias de duas escolas; a RPC deve recusar mistura de destinatários.
const userA = (await one("insert into auth.users default values returning id")).id;
const userB = (await one("insert into auth.users default values returning id")).id;
await db.query("insert into people(school_id,user_id) values($1,$2),($3,$4)", [
  a, userA, b, userB,
]);

// Decisão atómica de avisos: o lock da rota ocorre ANTES da leitura
// do estado anterior. PGlite valida contrato, idempotência e isolamento;
// concorrência entre ligações PostgreSQL independentes fica para staging.
const stateRpc =
  "public.siga_transport_set_day_status_atomic(uuid,uuid,date,text,integer,text,uuid,uuid[],text,text)";
for (const role of ["anon", "authenticated"]) {
  const allowed = await one("select has_function_privilege($1, $2, 'EXECUTE') as yes", [
    role,
    stateRpc,
  ]);
  assert.equal(allowed.yes, false, "RPC do estado exposta a " + role);
}
assert.equal(
  (await one("select has_function_privilege('service_role', $1, 'EXECUTE') as yes", [stateRpc]))
    .yes,
  true,
);
const saveDay = async (
  schoolId,
  routeId,
  status,
  delay = 0,
  note = null,
  recipients = [userA],
  title = "Aviso de transporte",
) =>
  (
    await one(
      "select public.siga_transport_set_day_status_atomic($1::uuid,$2::uuid,'2026-10-19'::date,$3::text,$4::integer,$5::text,null::uuid,$6::uuid[],$7::text,$8::text) as result",
      [schoolId, routeId, status, delay, note, recipients, title, "Estado actualizado"],
    )
  ).result;
const dayAuditCount = async () =>
  (
    await one(
      "select count(*)::integer as n from private.audit where table_name = 'siga_transport_day_status'",
    )
  ).n;
const noticeCount = async () =>
  (await one("select count(*)::integer as n from notifications where school_id = $1", [a])).n;
const previousDayAudit = await dayAuditCount();
assert.deepEqual(await saveDay(a, routeA, "delayed", 10), { changed: false, notified: 0 });
assert.equal(await dayAuditCount(), previousDayAudit, "repetição idêntica não audita UPDATE");
assert.deepEqual(await saveDay(a, routeA, "delayed", 20), { changed: true, notified: 1 });
assert.equal(await noticeCount(), 1, "aviso e estado devem ser gravados juntos");
const afterChangeAudit = await dayAuditCount();
assert.equal(afterChangeAudit, previousDayAudit + 1);
assert.deepEqual(await saveDay(a, routeA, "delayed", 20), { changed: false, notified: 0 });
assert.equal(await dayAuditCount(), afterChangeAudit, "idempotência também evita writes de auditoria");
assert.equal(await noticeCount(), 1, "repetição não duplica a notificação");
assert.deepEqual(await saveDay(a, routeA, "delayed", 20, "Atraso justificado"), {
  changed: false, notified: 0,
});
assert.equal(await dayAuditCount(), afterChangeAudit + 1, "nota alterada é gravada sem aviso");
assert.deepEqual(await saveDay(a, routeA, "delayed", 20, "Atraso justificado"), {
  changed: false, notified: 0,
});
assert.equal(await dayAuditCount(), afterChangeAudit + 1, "nota igual não repete UPDATE");

// Se a inserção do aviso falhar, status + audit devem voltar ao estado anterior.
const beforeFailureAudit = await dayAuditCount();
await assert.rejects(
  saveDay(a, routeA, "cancelled", 0, null, [userA], "__TEST_FAIL_NOTIFICATION__"),
  (error) => error.code === "23514",
);
assert.equal(await dayAuditCount(), beforeFailureAudit, "falha do aviso reverte a auditoria");
assert.equal(await noticeCount(), 1, "falha do aviso não deixa linhas parciais");
assert.deepEqual(
  await one("select status, delay_minutes from siga_transport_day_status where route_id = $1", [
    routeA,
  ]),
  { status: "delayed", delay_minutes: 20 },
);

// Um destinatário de outra escola é recusado antes de qualquer alteração.
await assert.rejects(saveDay(a, routeA, "cancelled", 0, null, [userB]), (error) => {
  assert.equal(error.code, "42501");
  return true;
});
assert.equal(await noticeCount(), 1);

// Repetições de um destinatário dentro do mesmo pedido criam apenas um aviso.
assert.deepEqual(await saveDay(a, routeA, "normal", 0, null, [userA, userA]), {
  changed: true, notified: 1,
});
assert.equal(await noticeCount(), 2);
const afterNormalAudit = await dayAuditCount();
assert.deepEqual(await saveDay(a, routeA, "normal"), { changed: false, notified: 0 });
assert.equal(await dayAuditCount(), afterNormalAudit, "estado normal não cria outra auditoria");
await assert.rejects(saveDay(b, routeA, "cancelled", 0, null, [userB]), (error) => {
  assert.equal(error.code, "23503");
  return true;
});
assert.deepEqual(
  await one("select status, delay_minutes from siga_transport_day_status where route_id = $1", [
    routeA,
  ]),
  { status: "normal", delay_minutes: 0 },
);
await assert.rejects(saveDay(a, routeA, "delayed", 0), (error) => error.code === "22023");

// ── Paragens atómicas: função SECURITY INVOKER só para service_role.
const rpc = "public.siga_transport_save_stops_atomic(uuid,uuid,uuid,jsonb)";
for (const role of ["anon", "authenticated"]) {
  const r = await one("select has_function_privilege($1, $2, 'EXECUTE') as allowed", [role, rpc]);
  assert.equal(r.allowed, false, "RPC de paragens exposta a " + role);
}
assert.equal(
  (await one("select has_function_privilege('service_role', $1, 'EXECUTE') as allowed", [rpc]))
    .allowed,
  true,
);

const saveStopsAtomic = async (school, routeId, stops) =>
  (
    await one(
      "select public.siga_transport_save_stops_atomic($1::uuid,$2::uuid,null::uuid,$3::jsonb) as result",
      [school, routeId, JSON.stringify(stops)],
    )
  ).result;

const secondStop = (await one(stop, [a, routeA, 2])).id;
const existingStops = async () =>
  (
    await db.query(
      "select id, sequence, name from siga_transport_stops where school_id = $1 and route_id = $2 order by sequence",
      [a, routeA],
    )
  ).rows;
const originalStops = await existingStops();

// Falha após reordenação: a última entrada rebenta a CHECK.
// A transacção da RPC não pode deixar a lista parcialmente reordenada.
await assert.rejects(
  saveStopsAtomic(a, routeA, [
    { id: secondStop, name: "B" },
    { id: stopA, name: "A" },
    { name: "X".repeat(121) },
  ]),
  (error) => error.code === "23514",
);
assert.deepEqual(await existingStops(), originalStops, "rollback integral nas paragens");

// Uma rota de outra escola não pode ser editada nem por service_role.
await assert.rejects(
  saveStopsAtomic(b, routeA, [{ id: stopA, name: "Tentativa" }]),
  (error) => error.code === "23503",
);
assert.deepEqual(await existingStops(), originalStops);

// Sucesso: reordena as 2 existentes e insere 1 nova numa única operação.
const appliedStops = await saveStopsAtomic(a, routeA, [
  { id: secondStop, name: "B", outbound_time: "06:30" },
  { id: stopA, name: "A" },
  { name: "Nova", landmark: "Escola" },
]);
assert.deepEqual(appliedStops, { saved: 3, removed: 0 });
const savedStops = await existingStops();
assert.deepEqual(
  savedStops.map((x) => [x.id, x.sequence, x.name]),
  [
    [secondStop, 1, "B"],
    [stopA, 2, "A"],
    [savedStops[2].id, 3, "Nova"],
  ],
);

// Não eliminar a paragem de um aluno; também aqui tudo se mantém intacto.
await assert.rejects(
  saveStopsAtomic(a, routeA, [{ id: secondStop, name: "B" }]),
  (error) => error.code === "23503",
);
assert.deepEqual(await existingStops(), savedStops);

// Prova de integridade relacional em UPDATE do PAI: o gatilho na tabela
// filha não corre nestas operações. Quem recusa é a chave composta PostgreSQL.
const rejectsParentChange = async (sql, params, expected) => {
  await assert.rejects(db.query(sql, params), (error) => {
    assert.equal(error.code, "23503", `${expected}: ${error.message}`);
    assert.ok(
      (Array.isArray(expected) ? expected : [expected]).includes(error.constraint),
      `Constraint inesperada: ${error.constraint}`,
    );
    return true;
  });
};

await rejectsParentChange(
  "update siga_class_tasks set school_id = $1 where id = $2",
  [b, taskA],
  "siga_submission_task_same_school_fk",
);
await rejectsParentChange(
  "update students set school_id = $1 where id = $2",
  [b, studentA],
  ["siga_submission_student_same_school_fk", "siga_transport_assignment_student_school_fk"],
);
await rejectsParentChange(
  "update siga_transport_vehicles set school_id = $1 where id = $2",
  [b, vehicleA],
  "siga_transport_route_vehicle_school_fk",
);
await assert.rejects(
  db.query("update siga_transport_routes set school_id = $1 where id = $2", [b, routeA]),
  (error) => error.code === "23503",
);
await rejectsParentChange(
  "update siga_transport_stops set route_id = $1 where id = $2",
  [routeA2, stopA],
  "siga_transport_assignment_stop_route_school_fk",
);

// ON DELETE SET NULL deve preservar school_id e só apagar vehicle_id, já que
// a rota da escola sobrevive à remoção da sua viatura.
await db.query("delete from siga_transport_vehicles where id = $1", [vehicleA]);
const stillRoute = await one(
  "select school_id, vehicle_id from siga_transport_routes where id = $1",
  [routeA],
);
assert.deepEqual(stillRoute, { school_id: a, vehicle_id: null });

// Conferir que as constraints realmente existem e não duplicaram na 2.ª
// execução de cada migração.
const installed = await db.query(`
  select conname from pg_constraint
  where conname in (
    'siga_submission_task_same_school_fk',
    'siga_submission_student_same_school_fk',
    'siga_transport_route_vehicle_school_fk',
    'siga_transport_stop_route_school_fk',
    'siga_transport_assignment_student_school_fk',
    'siga_transport_assignment_route_school_fk',
    'siga_transport_assignment_stop_route_school_fk',
    'siga_transport_day_route_school_fk'
  )
`);
assert.equal(installed.rows.length, 8, "oito FKs compostas instaladas uma única vez");
const pathIndex = await one(
  "select to_regclass('public.siga_task_submissions_storage_path_unique_idx') is not null as installed",
);
assert.equal(pathIndex.installed, true, "caminho de PDF único entre tarefas");

// Paragem com aluno não se apaga; a auditoria regista as escritas.
await assert.rejects(db.query("delete from siga_transport_stops where id = $1", [stopA]));
const audited = await one(
  "select count(*)::int as n from private.audit where table_name like 'siga_transport_%'",
);
assert.ok(audited.n >= 6, "auditoria das tabelas do transporte");

console.log("same-school-references: 2 migrações x2, 8 FKs compostas, pais protegidos");
