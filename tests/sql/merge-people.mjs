// Ensaio local (PGlite) de 20261010110000_teacher_number_and_merge_people.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/merge-people.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
  "../../supabase/migrations/20261010110000_teacher_number_and_merge_people.sql",
);
const pacote = read("../../docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql");
assert.ok(pacote.includes(migration), "o pacote leva a migração tal e qual");

const db = new PGlite();
// Colunas como na produção (information_schema, 2026-10-10), só as que as funções tocam.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.aal2', true), 'on') = 'on' $$;
CREATE FUNCTION private.has_permission(s uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE public.people (id uuid PRIMARY KEY, school_id uuid NOT NULL, full_name text NOT NULL,
  email text, phone text, national_id text, date_of_birth date, status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','inactive','archived')), user_id uuid, updated_by uuid, deleted_at timestamptz);
CREATE UNIQUE INDEX people_school_email_uidx ON public.people (school_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX people_school_national_id_uidx ON public.people (school_id, upper(national_id)) WHERE national_id IS NOT NULL;
CREATE UNIQUE INDEX people_one_active_login_per_school ON public.people (school_id, user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE TABLE public.students (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, person_id uuid NOT NULL, updated_by uuid);
CREATE TABLE public.teachers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, person_id uuid NOT NULL,
  employee_number text NOT NULL, hired_on date NOT NULL, employment_type text NOT NULL, highest_qualification text NOT NULL,
  status text NOT NULL DEFAULT 'active', created_by uuid NOT NULL, updated_by uuid NOT NULL, user_id uuid,
  CONSTRAINT teachers_school_id_employee_number_key UNIQUE (school_id, employee_number));
CREATE TABLE public.subjects (id uuid PRIMARY KEY, school_id uuid NOT NULL, status text NOT NULL DEFAULT 'active');
CREATE TABLE public.teacher_subjects (school_id uuid, teacher_id uuid, subject_id uuid, valid_from date, created_by uuid);
CREATE TABLE private.teacher_number_sequences (school_id uuid PRIMARY KEY, next_number bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.person_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, person_id uuid NOT NULL, updated_by uuid);
CREATE TABLE public.siga_access_cards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, person_id uuid NOT NULL);
CREATE TABLE public.hr_employments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, person_id uuid NOT NULL, updated_by uuid, deleted_at timestamptz);
CREATE TABLE public.student_guardians (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, student_id uuid NOT NULL,
  guardian_person_id uuid NOT NULL, is_primary boolean NOT NULL DEFAULT false, UNIQUE (student_id, guardian_person_id));
CREATE UNIQUE INDEX student_guardians_one_primary_uidx ON public.student_guardians (student_id) WHERE is_primary;
CREATE TABLE public.person_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, person_id uuid NOT NULL,
  role text NOT NULL, updated_by uuid, deleted_at timestamptz);
CREATE TABLE public.audit_logs (id bigserial PRIMARY KEY, school_id uuid NOT NULL, actor_user_id uuid, action text NOT NULL,
  entity_type text NOT NULL, entity_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
-- Falha provocada no último passo (a auditoria), para provar que nada fica a meio.
CREATE FUNCTION public.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail_audit', true) = 'on' THEN RAISE EXCEPTION 'falha provocada'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fail_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.fail_audit();
`);

const S = "00000000-0000-0000-0000-00000000000a";
const ACTOR = "00000000-0000-0000-0000-0000000000ff";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const refused = async (promise, pattern) =>
  assert.rejects(promise, (error) => pattern.test(String(error.message)));

await db.exec(migration);
await db.exec(migration);

// ── register_teacher: nunca abaixo do maior número da escola ──
await db.exec(`SET request.jwt.claim.sub = '${ACTOR}'`);
const person = (n) =>
  db.query("INSERT INTO public.people (id, school_id, full_name) VALUES ($1, $2, $3)", [
    id(n),
    S,
    `Pessoa ${n}`,
  ]);
const register = async (n) =>
  (
    await db.query(
      `SELECT (private.register_teacher($1, $2, current_date, 'permanent', 'bachelor'))->>'employeeNumber' AS number`,
      [S, id(n)],
    )
  ).rows[0].number;
for (const [n, number] of [
  [1, "DOC-000001"],
  [2, "DOC-000002"],
  [3, "DOC-000007"],
  [4, "DOC-9F3A61C2B0"],
]) {
  await person(n);
  await db.query(
    `INSERT INTO public.teachers (school_id, person_id, employee_number, hired_on, employment_type, highest_qualification, created_by, updated_by)
     VALUES ($1, $2, $3, current_date, 'permanent', 'bachelor', $4, $4)`,
    [S, id(n), number, ACTOR],
  );
}
await person(5);
// Sem linha na sequência (como hoje na produção): antes dava DOC-000001, que já existe.
assert.equal(await register(5), "DOC-000008");
await person(6);
assert.equal(await register(6), "DOC-000009");
// Sequência à frente (números já gastos): respeita-a.
await db.query(
  "UPDATE private.teacher_number_sequences SET next_number = 20 WHERE school_id = $1",
  [S],
);
await person(7);
assert.equal(await register(7), "DOC-000020");
// Continua a exigir 2FA.
await db.exec("SET test.aal2 = 'off'");
await person(8);
await refused(register(8), /Sem autorização/);
await db.exec("SET test.aal2 = 'on'");

// ── merge_people ──
const merge = (survivor, duplicate) =>
  db.query("SELECT public.siga_merge_people($1, $2, $3, 'duplicado', $4) AS r", [
    S,
    id(survivor),
    id(duplicate),
    ACTOR,
  ]);
const SURV = 100;
const DUP = 101;
const LOGIN = "00000000-0000-0000-0000-0000000000cc";
await db.query(
  `INSERT INTO public.people (id, school_id, full_name, email, phone) VALUES ($1, $3, 'Maria José', NULL, '+244923000000'),
   ($2, $3, 'Maria Jose', 'maria@escola.ao', NULL)`,
  [id(SURV), id(DUP), S],
);
await db.query(
  "UPDATE public.people SET national_id = '000111222LA033', user_id = $2 WHERE id = $1",
  [id(DUP), LOGIN],
);
const studentA = id(500);
const studentB = id(501);
await db.query(
  `INSERT INTO public.student_guardians (school_id, student_id, guardian_person_id, is_primary) VALUES
   ($1, $2, $3, true),   -- educando A: só no duplicado → passa
   ($1, $4, $5, true),   -- educando B: na ficha que fica…
   ($1, $4, $3, false)   -- …e no duplicado → sai`,
  [S, studentA, id(DUP), studentB, id(SURV)],
);
await db.query("INSERT INTO public.person_documents (school_id, person_id) VALUES ($1, $2)", [
  S,
  id(DUP),
]);
await db.query("INSERT INTO public.siga_access_cards (school_id, person_id) VALUES ($1, $2)", [
  S,
  id(DUP),
]);
await db.query("INSERT INTO public.hr_employments (school_id, person_id) VALUES ($1, $2)", [
  S,
  id(DUP),
]);
await db.query(
  "INSERT INTO public.person_roles (school_id, person_id, role) VALUES ($1, $2, 'guardian'), ($1, $3, 'guardian'), ($1, $3, 'staff')",
  [S, id(SURV), id(DUP)],
);
const snapshot = async () => {
  const queries = [
    [
      "SELECT id, email, phone, national_id, status, user_id FROM public.people WHERE id IN ($1, $2) ORDER BY id",
      [id(SURV), id(DUP)],
    ],
    [
      "SELECT student_id, guardian_person_id FROM public.student_guardians WHERE school_id = $1 ORDER BY 1, 2",
      [S],
    ],
    [
      "SELECT person_id FROM public.person_documents UNION ALL SELECT person_id FROM public.siga_access_cards UNION ALL SELECT person_id FROM public.hr_employments",
      [],
    ],
    ["SELECT person_id, role FROM public.person_roles ORDER BY 1, 2", []],
  ];
  const rows = [];
  for (const [sql, params] of queries) rows.push((await db.query(sql, params)).rows);
  return JSON.stringify(rows);
};

// Uma falha no último passo desfaz tudo: nada fica a meio.
// A ficha que fica é professor, sem conta; a conta está no duplicado.
await db.query(
  `INSERT INTO public.teachers (school_id, person_id, employee_number, hired_on, employment_type, highest_qualification, created_by, updated_by)
   VALUES ($1, $2, 'DOC-000050', current_date, 'permanent', 'bachelor', $3, $3)`,
  [S, id(SURV), ACTOR],
);
const before = await snapshot();
await db.exec("SET test.fail_audit = 'on'");
await refused(merge(SURV, DUP), /falha provocada/);
await db.exec("SET test.fail_audit = 'off'");
assert.equal(await snapshot(), before, "a fusão falhada não deixa nada mudado");

const { rows } = await merge(SURV, DUP);
assert.equal(rows[0].r.movedGuardianLinks, 1);
assert.equal(rows[0].r.removedRedundantGuardianLinks, 1);
assert.equal(rows[0].r.movedLogin, true);
const people = Object.fromEntries(
  (
    await db.query("SELECT * FROM public.people WHERE id IN ($1, $2)", [id(SURV), id(DUP)])
  ).rows.map((r) => [r.id, r]),
);
assert.equal(people[id(SURV)].email, "maria@escola.ao");
assert.equal(people[id(SURV)].national_id, "000111222LA033");
assert.equal(people[id(SURV)].user_id, LOGIN);
// …e a conta liga-se também ao professor (o servidor procura por teachers.user_id).
const teacherLogin = (
  await db.query("SELECT user_id FROM public.teachers WHERE person_id = $1", [id(SURV)])
).rows[0].user_id;
assert.equal(teacherLogin, LOGIN);
assert.equal(people[id(SURV)].phone, "+244923000000");
assert.equal(people[id(DUP)].status, "inactive");
assert.equal(people[id(DUP)].email, null);
assert.equal(people[id(DUP)].user_id, null);
const links = (
  await db.query("SELECT student_id, guardian_person_id FROM public.student_guardians")
).rows;
assert.equal(links.length, 2);
assert.ok(links.every((l) => l.guardian_person_id === id(SURV)));
const moved = (
  await db.query(
    "SELECT count(*)::int AS n FROM (SELECT person_id FROM public.person_documents UNION ALL SELECT person_id FROM public.siga_access_cards UNION ALL SELECT person_id FROM public.hr_employments) x WHERE person_id = $1",
    [id(SURV)],
  )
).rows[0].n;
assert.equal(moved, 3);
const roles = (await db.query("SELECT person_id, role FROM public.person_roles ORDER BY role"))
  .rows;
assert.deepEqual(
  roles.map((r) => [r.person_id === id(SURV) ? "fica" : "duplicado", r.role]),
  [
    ["fica", "guardian"],
    ["duplicado", "guardian"],
    ["fica", "staff"],
  ],
);
const audit = (await db.query("SELECT action, metadata FROM public.audit_logs")).rows;
assert.equal(audit.length, 1);
assert.equal(audit[0].action, "people.merged");
assert.equal(audit[0].metadata.reason, "duplicado");

// Recusas, sem escrever nada.
await db.query(
  `INSERT INTO public.people (id, school_id, full_name, user_id) VALUES ($1, $3, 'Com conta', $4), ($2, $3, 'Outra conta', $5)`,
  [id(200), id(201), S, id(9001), id(9002)],
);
await refused(merge(200, 201), /contas de acesso diferentes/);
await db.query("INSERT INTO public.students (school_id, person_id) VALUES ($1, $2), ($1, $3)", [
  S,
  id(1),
  id(2),
]);
await refused(merge(1, 2), /matrícula de aluno/);
await refused(merge(1, 1), /duas pessoas diferentes/);
await refused(merge(1, 999), /não existe nesta escola/);

// Só o servidor: o browser (authenticated) não a pode chamar.
const grants = (
  await db.query(
    `SELECT has_function_privilege('authenticated', 'public.siga_merge_people(uuid,uuid,uuid,text,uuid)', 'EXECUTE') AS auth,
            has_function_privilege('service_role', 'public.siga_merge_people(uuid,uuid,uuid,text,uuid)', 'EXECUTE') AS svc`,
  )
).rows[0];
assert.equal(grants.auth, false);
assert.equal(grants.svc, true);

console.log(
  "merge-people: register_teacher numera acima do maior número; fusão completa numa transacção, desfeita por inteiro se falhar; recusas e permissões; idempotente.",
);
