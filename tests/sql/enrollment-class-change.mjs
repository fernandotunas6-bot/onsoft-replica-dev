// Ensaio local (PGlite) do pacote docs/agents/SIGA_aplicar_mudar_turma.sql
// (migração 20261006100000). Sem produção.
// Uso: node tests/sql/enrollment-class-change.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
// Colunas lidas da produção (2026-10-05), só as que o gatilho usa, e o gatilho de antes
// (capturado em 20260908210000_capture_all_db_functions.sql).
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE TABLE public.class_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  capacity integer NOT NULL,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  student_id uuid NOT NULL,
  enrollment_number text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  end_reason text,
  created_by uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION private.protect_enrollment_identity()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
begin
  if new.id <> old.id or new.school_id <> old.school_id
     or new.academic_year_id <> old.academic_year_id
     or new.class_group_id <> old.class_group_id or new.student_id <> old.student_id
     or new.enrollment_number <> old.enrollment_number
     or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception using errcode = '22023', message = 'Identidade da matrícula é imutável.';
  end if;
  new.end_reason := nullif(btrim(new.end_reason), '');
  new.updated_at := now();
  return new;
end;
$function$;
CREATE TRIGGER protect_enrollment_identity BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION private.protect_enrollment_identity();
CREATE TABLE public.siga_direct_messages (id uuid PRIMARY KEY);
CREATE TABLE public.student_academic_history (id uuid PRIMARY KEY);
CREATE TABLE public.import_table_specs (table_schema text, table_name text, direct_import_policy text);
`);

const pacote = read("../../docs/agents/SIGA_aplicar_mudar_turma.sql");
assert.ok(
  pacote.includes(read("../../supabase/migrations/20261006100000_enrollment_class_change.sql")),
);
const confirmar = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const estado = async () => Object.values((await db.query(confirmar)).rows[0])[0];
const sonda = async () =>
  (await db.exec(read("../../docs/agents/SIGA_confirmar_migracoes.sql")))
    .at(-1)
    .rows.find((r) => r.migracao === "20261006100000_enrollment_class_change").estado;

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const school = "11111111-1111-4111-8111-111111111111";
const year = "22222222-2222-4222-8222-222222222222";
const nextYear = "33333333-3333-4333-8333-333333333333";
const group = (capacity, academicYear = year, status = "active") =>
  one(
    "insert into class_groups(school_id, academic_year_id, capacity, status) values ($1,$2,$3,$4) returning id",
    [school, academicYear, capacity, status],
  ).then((r) => r.id);
let n = 0;
const enroll = (classGroup, status = "active") =>
  one(
    `insert into enrollments(school_id, academic_year_id, class_group_id, student_id, enrollment_number, status)
     values ($1,$2,$3,gen_random_uuid(),$4,$5) returning id`,
    [school, year, classGroup, `MAT-${++n}`, status],
  ).then((r) => r.id);
const move = (enrollment, classGroup) =>
  db.query("update enrollments set class_group_id = $2 where id = $1", [enrollment, classGroup]);

const a = await group(30);
const b = await group(2);
const ana = await enroll(a);

// Antes do pacote: mudar de turma é recusado, como na produção.
await assert.rejects(move(ana, b), /Identidade da matrícula é imutável/);
assert.equal(await estado(), "por aplicar");
assert.equal(await sonda(), "EM FALTA");

for (let corrida = 0; corrida < 2; corrida++) {
  assert.deepEqual((await db.exec(pacote)).at(-1).rows[0], {
    "20261006100000 mudar de turma": "aplicada",
  });
}
assert.equal(await sonda(), "aplicada");

// Mudar de turma no mesmo ano: a matrícula fica a mesma (id, número), só a turma muda.
await move(ana, b);
assert.deepEqual(
  await one("select class_group_id, enrollment_number from enrollments where id = $1", [ana]),
  {
    class_group_id: b,
    enrollment_number: "MAT-1",
  },
);

// Lotação: B tem 2 lugares; pending conta como lugar ocupado.
const beto = await enroll(a, "pending");
await move(beto, b);
const carla = await enroll(a);
await assert.rejects(move(carla, b), /A turma atingiu a capacidade configurada/);
// Voltar a activo numa turma cheia também ocupa um lugar.
await db.query("update enrollments set status = 'cancelled' where id = $1", [beto]);
await move(carla, b);
await assert.rejects(
  db.query("update enrollments set status = 'active' where id = $1", [beto]),
  /capacidade/,
);
// Mexer noutra coisa numa turma já cheia (ou acima) não é recusado.
await db.query("update class_groups set capacity = 1 where id = $1", [b]);
await db.query("update enrollments set end_reason = '  ' where id = $1", [ana]);
assert.equal(
  (await one("select end_reason from enrollments where id = $1", [ana])).end_reason,
  null,
);

// Turma de outro ano, ou desactivada: recusado.
const other = await group(30, nextYear);
await assert.rejects(move(carla, other), /mesmo ano lectivo/);
const closed = await group(30, year, "closed");
await assert.rejects(move(carla, closed), /Turma ativa inválida/);
// O resto da identidade continua imutável.
await assert.rejects(
  db.query("update enrollments set enrollment_number = 'X' where id = $1", [ana]),
  /Identidade da matrícula é imutável/,
);
await assert.rejects(
  db.query("update enrollments set academic_year_id = $2 where id = $1", [ana, nextYear]),
  /Identidade da matrícula é imutável/,
);
// Só o gatilho a corre: ninguém a chama pela API.
for (const role of ["anon", "authenticated"]) {
  const can = await one(
    "select has_function_privilege($1, 'private.protect_enrollment_identity()', 'EXECUTE') as v",
    [role],
  );
  assert.equal(can.v, false, role);
}

console.log(
  "enrollment-class-change: pacote idempotente, mudança de turma, lotação e identidade ok",
);
