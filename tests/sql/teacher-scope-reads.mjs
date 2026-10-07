// Ensaio local (PGlite) de 20261007100000_teacher_scope_and_treasury_reads.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/teacher-scope-reads.mjs
//
// Auditoria 13, F-01/F-08. Funções auxiliares e políticas «antes» copiadas da produção
// (pg_get_functiondef / pg_policies, 2026-10-07). Duas escolas, duas turmas em A; o
// professor só lecciona T1.
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261007100000_teacher_scope_and_treasury_reads.sql",
    import.meta.url,
  ),
  "utf8",
);
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.school_memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, user_id uuid, status text DEFAULT 'active');
CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, code text);
CREATE TABLE public.member_roles (school_id uuid, membership_id uuid, role_id uuid);
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE);
CREATE TABLE public.role_permissions (school_id uuid, role_id uuid, permission_id uuid);
CREATE TABLE public.teachers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, user_id uuid, status text DEFAULT 'active');
CREATE TABLE public.class_subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, class_group_id uuid, subject_id uuid, teacher_id uuid, status text DEFAULT 'active');
CREATE TABLE public.people (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, full_name text);
CREATE TABLE public.students (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, person_id uuid);
CREATE TABLE public.enrollments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, class_group_id uuid, student_id uuid, status text DEFAULT 'active');
CREATE TABLE public.student_guardians (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, student_id uuid);
CREATE TABLE public.siga_assessment_scores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, item_id uuid, enrollment_id uuid, score numeric);
CREATE TABLE public.siga_attendance_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, class_group_id uuid);
CREATE TABLE public.siga_attendance_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, session_id uuid, student_id uuid);
CREATE TABLE public.siga_attendance_justifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, student_id uuid);

CREATE FUNCTION private.user_member_school_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT sm.school_id FROM public.school_memberships sm WHERE sm.user_id = (SELECT auth.uid()) AND sm.status = 'active' AND sm.school_id IS NOT NULL $f$;
CREATE FUNCTION private.user_role_school_ids(p_codes text[]) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT sm.school_id FROM public.school_memberships sm JOIN public.member_roles mr ON mr.membership_id = sm.id JOIN public.roles r ON r.id = mr.role_id
  WHERE sm.user_id = (SELECT auth.uid()) AND sm.status = 'active' AND sm.school_id IS NOT NULL AND lower(btrim(r.code)) = ANY (p_codes) $f$;
CREATE FUNCTION private.user_permission_school_ids(permission_code text) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT m.school_id FROM public.school_memberships m JOIN public.member_roles mr ON mr.school_id = m.school_id AND mr.membership_id = m.id
  JOIN public.role_permissions rp ON rp.school_id = mr.school_id AND rp.role_id = mr.role_id JOIN public.permissions p ON p.id = rp.permission_id
  WHERE (SELECT auth.uid()) IS NOT NULL AND m.user_id = (SELECT auth.uid()) AND m.status = 'active' AND m.school_id IS NOT NULL AND p.code = permission_code $f$;
CREATE FUNCTION private.teacher_students() RETURNS TABLE(school_id uuid, student_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT e.school_id, e.student_id FROM public.enrollments e JOIN public.class_subjects cs ON cs.school_id = e.school_id AND cs.class_group_id = e.class_group_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE e.status IN ('active','pending') AND cs.status = 'active' AND t.status = 'active' AND t.user_id = (SELECT auth.uid()) $f$;
CREATE FUNCTION private.teacher_people() RETURNS TABLE(school_id uuid, person_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT s.school_id, s.person_id FROM public.students s JOIN public.enrollments e ON e.school_id = s.school_id AND e.student_id = s.id
  JOIN public.class_subjects cs ON cs.school_id = e.school_id AND cs.class_group_id = e.class_group_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE e.status IN ('active','pending') AND cs.status = 'active' AND t.status = 'active' AND t.user_id = (SELECT auth.uid()) $f$;
CREATE FUNCTION private.teacher_class_subjects(p_require_active_teacher boolean) RETURNS TABLE(school_id uuid, class_subject_id uuid, class_group_id uuid, subject_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT cs.school_id, cs.id, cs.class_group_id, cs.subject_id FROM public.class_subjects cs JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE cs.status = 'active' AND t.user_id = (SELECT auth.uid()) AND (NOT p_require_active_teacher OR t.status = 'active') $f$;
-- O ramo do professor nas notas vive em current_user_can_manage_assessment_score; aqui
-- reduzido ao essencial (a nota é de um aluno de uma turma do professor).
CREATE FUNCTION public.current_user_can_manage_assessment_score(p_school_id uuid, p_item_id uuid, p_enrollment_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.enrollments e JOIN private.teacher_class_subjects(true) tc ON tc.school_id = e.school_id AND tc.class_group_id = e.class_group_id
    WHERE e.id = p_enrollment_id AND e.school_id = p_school_id) $f$;
GRANT USAGE ON SCHEMA public, private, auth TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private, public, auth TO authenticated;
`);

// Políticas de antes (produção) e as restritivas que ficam.
const STAFF = `school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria','treasury','tesouraria','finance','teacher','professor']))`;
const OFFICE = `school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))`;
const MEMBER = `school_id IN (SELECT private.user_member_school_ids())`;
await db.exec(`
${[
  "students",
  "people",
  "enrollments",
  "student_guardians",
  "siga_assessment_scores",
  "siga_attendance_records",
  "siga_attendance_sessions",
  "siga_attendance_justifications",
]
  .map((t) => `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)
  .join("\n")}
${[
  "students",
  "student_guardians",
  "siga_assessment_scores",
  "siga_attendance_records",
  "siga_attendance_sessions",
  "siga_attendance_justifications",
]
  .map(
    (t) =>
      `CREATE POLICY "School staff only" ON public.${t} AS RESTRICTIVE FOR ALL TO authenticated USING (${STAFF}) WITH CHECK (${STAFF});`,
  )
  .join("\n")}
CREATE POLICY students_read ON public.students FOR SELECT TO authenticated USING (
  school_id IN (SELECT private.user_permission_school_ids('students.records.read')) OR (${MEMBER} AND (${OFFICE}
  OR (school_id, id) IN (SELECT ts.school_id, ts.student_id FROM private.teacher_students() ts(school_id, student_id)))));
CREATE POLICY people_read ON public.people FOR SELECT TO authenticated USING (
  school_id IN (SELECT private.user_permission_school_ids('people.records.read')) OR (${MEMBER} AND (${OFFICE}
  OR (school_id, id) IN (SELECT tp.school_id, tp.person_id FROM private.teacher_people() tp(school_id, person_id)))));
CREATE POLICY enrollments_read ON public.enrollments FOR SELECT TO authenticated USING (
  school_id IN (SELECT private.user_permission_school_ids('students.enrollments.read')) OR (${MEMBER} AND (${OFFICE}
  OR (status = ANY (ARRAY['active','pending']) AND (school_id, class_group_id) IN (SELECT tc.school_id, tc.class_group_id FROM private.teacher_class_subjects(true) tc(school_id, class_subject_id, class_group_id, subject_id))))));
CREATE POLICY student_guardians_read ON public.student_guardians FOR SELECT TO authenticated USING (
  (${MEMBER} AND ${OFFICE}) OR school_id IN (SELECT private.user_permission_school_ids('students.records.read')));
CREATE POLICY siga_assessment_scores_read ON public.siga_assessment_scores FOR SELECT TO authenticated USING (
  public.current_user_can_manage_assessment_score(school_id, item_id, enrollment_id) OR ${MEMBER});
CREATE POLICY "Members read siga_attendance_records" ON public.siga_attendance_records FOR SELECT TO authenticated USING (${MEMBER});
CREATE POLICY "Members read siga_attendance_sessions" ON public.siga_attendance_sessions FOR SELECT TO authenticated USING (${MEMBER});
CREATE POLICY "Members read siga_attendance_justifications" ON public.siga_attendance_justifications FOR SELECT TO authenticated USING (${MEMBER});
`);

// Dados sintéticos.
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const users = {
  adminA: "10000000-0000-0000-0000-000000000001",
  teacherA: "10000000-0000-0000-0000-000000000002",
  treasuryA: "10000000-0000-0000-0000-000000000003",
  secretaryTeacherA: "10000000-0000-0000-0000-000000000004", // secretaria e professora
  adminB: "10000000-0000-0000-0000-000000000005",
};
const PERMS = {
  owner: ["students.records.read", "people.records.read", "students.enrollments.read"],
  secretary: ["students.records.read", "people.records.read", "students.enrollments.read"],
  teacher: ["students.records.read", "people.records.read", "students.enrollments.read"],
  treasury: ["students.records.read", "people.records.read", "students.enrollments.read"],
};
await db.exec(
  `INSERT INTO public.permissions(code) VALUES ('students.records.read'),('people.records.read'),('students.enrollments.read');`,
);
for (const school of [A, B]) {
  for (const [code, perms] of Object.entries(PERMS)) {
    await db.exec(`
      INSERT INTO public.roles(school_id, code) VALUES ('${school}', '${code}');
      INSERT INTO public.role_permissions SELECT '${school}', r.id, p.id FROM public.roles r, public.permissions p
        WHERE r.school_id = '${school}' AND r.code = '${code}' AND p.code = ANY (ARRAY[${perms.map((p) => `'${p}'`).join(",")}]);`);
  }
}
async function link(user, school, ...codes) {
  const { rows } = await db.query(
    `INSERT INTO public.school_memberships(school_id, user_id) VALUES ($1, $2) RETURNING id`,
    [school, user],
  );
  for (const code of codes) {
    await db.query(
      `INSERT INTO public.member_roles SELECT $1, $2, id FROM public.roles WHERE school_id = $1 AND code = $3`,
      [school, rows[0].id, code],
    );
  }
}
await link(users.adminA, A, "owner");
await link(users.teacherA, A, "teacher");
await link(users.treasuryA, A, "treasury");
await link(users.secretaryTeacherA, A, "secretary", "teacher");
await link(users.adminB, B, "owner");
await db.exec(`
INSERT INTO public.teachers(id, school_id, user_id) VALUES
  ('20000000-0000-0000-0000-000000000002', '${A}', '${users.teacherA}'),
  ('20000000-0000-0000-0000-000000000004', '${A}', '${users.secretaryTeacherA}');
`);
for (const school of [A, B]) {
  for (const turma of ["T1", "T2"]) {
    const group = `${school.slice(0, 35)}${turma === "T1" ? "1" : "2"}`.replace(
      /.$/,
      turma === "T1" ? "1" : "2",
    );
    const { rows: person } = await db.query(
      `INSERT INTO public.people(school_id, full_name) VALUES ($1, $2) RETURNING id`,
      [school, `AUDIT ${turma}`],
    );
    const { rows: student } = await db.query(
      `INSERT INTO public.students(school_id, person_id) VALUES ($1, $2) RETURNING id`,
      [school, person[0].id],
    );
    const { rows: enrollment } = await db.query(
      `INSERT INTO public.enrollments(school_id, class_group_id, student_id) VALUES ($1, $2, $3) RETURNING id`,
      [school, group, student[0].id],
    );
    const { rows: session } = await db.query(
      `INSERT INTO public.siga_attendance_sessions(school_id, class_group_id) VALUES ($1, $2) RETURNING id`,
      [school, group],
    );
    await db.query(`INSERT INTO public.student_guardians(school_id, student_id) VALUES ($1, $2)`, [
      school,
      student[0].id,
    ]);
    await db.query(
      `INSERT INTO public.siga_assessment_scores(school_id, item_id, enrollment_id, score) VALUES ($1, gen_random_uuid(), $2, 12)`,
      [school, enrollment[0].id],
    );
    await db.query(
      `INSERT INTO public.siga_attendance_records(school_id, session_id, student_id) VALUES ($1, $2, $3)`,
      [school, session[0].id, student[0].id],
    );
    await db.query(
      `INSERT INTO public.siga_attendance_justifications(school_id, student_id) VALUES ($1, $2)`,
      [school, student[0].id],
    );
    if (school === A && turma === "T1") {
      await db.exec(`INSERT INTO public.class_subjects(school_id, class_group_id, subject_id, teacher_id) VALUES
        ('${A}', '${group}', gen_random_uuid(), '20000000-0000-0000-0000-000000000002'),
        ('${A}', '${group}', gen_random_uuid(), '20000000-0000-0000-0000-000000000004');`);
    }
  }
}

const TABLES = [
  "students",
  "people",
  "enrollments",
  "student_guardians",
  "siga_assessment_scores",
  "siga_attendance_records",
  "siga_attendance_sessions",
  "siga_attendance_justifications",
];
async function visible(user) {
  const out = {};
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${user}', false);`,
  );
  for (const t of TABLES) {
    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE school_id = '${A}')::int AS a, count(*) FILTER (WHERE school_id = '${B}')::int AS b FROM public.${t}`,
    );
    out[t] = [rows[0].a, rows[0].b];
  }
  await db.exec(`RESET ROLE;`);
  return out;
}

// Antes: o defeito.
const before = await visible(users.teacherA);
assert.deepEqual(before.students, [2, 0], "antes, o professor de T1 via os 2 alunos de A");
assert.deepEqual(before.siga_assessment_scores, [2, 0], "antes, via as notas das duas turmas");
const beforeTreasury = await visible(users.treasuryA);
assert.deepEqual(beforeTreasury.siga_assessment_scores, [2, 0], "antes, a tesouraria via notas");

// A migração, duas vezes.
await db.exec(migration);
await db.exec(migration);

const teacher = await visible(users.teacherA);
for (const t of TABLES) assert.deepEqual(teacher[t], [1, 0], `professor de T1 em ${t}: só T1`);

const admin = await visible(users.adminA);
for (const t of TABLES) assert.deepEqual(admin[t], [2, 0], `administrador em ${t}: escola inteira`);

const secretaryTeacher = await visible(users.secretaryTeacherA);
for (const t of TABLES)
  assert.deepEqual(secretaryTeacher[t], [2, 0], `secretaria que também é professora em ${t}`);

const treasury = await visible(users.treasuryA);
assert.deepEqual(treasury.students, [2, 0], "tesouraria continua a ver alunos");
assert.deepEqual(treasury.enrollments, [2, 0], "tesouraria continua a ver matrículas");
assert.deepEqual(treasury.student_guardians, [2, 0], "tesouraria continua a ver encarregados");
for (const t of [
  "siga_assessment_scores",
  "siga_attendance_records",
  "siga_attendance_sessions",
  "siga_attendance_justifications",
]) {
  assert.deepEqual(treasury[t], [0, 0], `tesouraria deixa de ver ${t}`);
}

const adminB = await visible(users.adminB);
for (const t of TABLES) assert.deepEqual(adminB[t], [0, 2], `isolamento: admin B em ${t}`);

const { rows: grants } = await db.query(
  `SELECT has_function_privilege('anon', 'private.user_wide_reader_school_ids()', 'EXECUTE') AS anon_exec,
          has_function_privilege('authenticated', 'private.user_wide_reader_school_ids()', 'EXECUTE') AS auth_exec`,
);
assert.equal(grants[0].anon_exec, false);
assert.equal(grants[0].auth_exec, true);

console.log(
  "teacher-scope-reads: ok (antes: professor via a escola inteira; depois: só as suas turmas; tesouraria sem notas nem presenças)",
);
