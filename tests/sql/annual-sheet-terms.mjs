// Ensaio local (PGlite) de 20261002160000_annual_sheet_requires_all_terms.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/annual-sheet-terms.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
// Só as colunas que build_grade_sheet usa; as dependências privadas são simuladas.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION private.has_permission(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION private.archive_grade_sheet_version(uuid, uuid, uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE TABLE public.class_groups(id uuid PRIMARY KEY, school_id uuid, academic_year_id uuid, code text);
CREATE TABLE public.terms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, academic_year_id uuid, name text);
CREATE TABLE public.assessment_rule_sets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, status text, code text, version int, formula jsonb, passing_value numeric, maximum_absence_percentage numeric);
CREATE TABLE public.grade_sheets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, academic_year_id uuid, term_id uuid, class_group_id uuid, rule_set_id uuid, kind text, status text, title text, created_by uuid, updated_by uuid, updated_at timestamptz);
CREATE TABLE public.grade_sheet_rows(school_id uuid, grade_sheet_id uuid, enrollment_id uuid, continuous_average numeric, exam_average numeric, term_average numeric, absence_percentage numeric, result text, subject_breakdown jsonb);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY, school_id uuid, class_group_id uuid, status text, student_id uuid);
CREATE TABLE public.subjects(id uuid PRIMARY KEY, school_id uuid, name text);
CREATE TABLE public.class_subjects(id uuid PRIMARY KEY, school_id uuid, subject_id uuid, class_group_id uuid);
CREATE TABLE public.gradebooks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, class_group_id uuid, class_subject_id uuid, term_id uuid);
CREATE TABLE public.assessment_key_subjects(school_id uuid, rule_set_id uuid, subject_id uuid);
CREATE TABLE public.siga_attendance_sessions(id uuid, school_id uuid, class_group_id uuid);
CREATE TABLE public.siga_attendance_records(school_id uuid, session_id uuid, student_id uuid, status text);
CREATE TABLE public.attendance_sessions(id uuid, school_id uuid, class_subject_id uuid);
CREATE TABLE public.attendance_records(school_id uuid, attendance_session_id uuid, enrollment_id uuid, status text);
CREATE TABLE test_averages(gradebook_id uuid, enrollment_id uuid, avg numeric);
CREATE FUNCTION private.compute_subject_averages(s uuid, gb uuid, e uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT CASE WHEN a.avg IS NULL THEN jsonb_build_object('average', null)
    ELSE jsonb_build_object('continuous', a.avg, 'exam', a.avg, 'average', a.avg) END
  FROM (SELECT (SELECT avg FROM public.test_averages WHERE gradebook_id = gb AND enrollment_id = e) AS avg) a $$;
`);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261002160000_annual_sheet_requires_all_terms.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);

const school = "00000000-0000-0000-0000-00000000000a";
const year = "00000000-0000-0000-0000-0000000000a1";
const group = "00000000-0000-0000-0000-0000000000c1";
const [mat, por] = ["00000000-0000-0000-0000-0000000000d1", "00000000-0000-0000-0000-0000000000d2"];
const [csMat, csPor] = [
  "00000000-0000-0000-0000-0000000000e1",
  "00000000-0000-0000-0000-0000000000e2",
];
const [ana, beto] = [
  "00000000-0000-0000-0000-0000000000f1",
  "00000000-0000-0000-0000-0000000000f2",
];
await db.exec(`
INSERT INTO class_groups VALUES ('${group}', '${school}', '${year}', '10A');
INSERT INTO assessment_rule_sets(school_id,status,code,version,formula,passing_value,maximum_absence_percentage)
  VALUES ('${school}','active','DEFAULT',1,'{}',10,30);
INSERT INTO subjects VALUES ('${mat}','${school}','Matemática'),('${por}','${school}','Português');
INSERT INTO class_subjects VALUES ('${csMat}','${school}','${mat}','${group}'),('${csPor}','${school}','${por}','${group}');
INSERT INTO enrollments VALUES ('${ana}','${school}','${group}','active',gen_random_uuid()),('${beto}','${school}','${group}','active',gen_random_uuid());
INSERT INTO terms(school_id,academic_year_id,name) VALUES ('${school}','${year}','T1'),('${school}','${year}','T2'),('${school}','${year}','T3');
INSERT INTO gradebooks(school_id,class_group_id,class_subject_id,term_id)
  SELECT '${school}','${group}',cs, t.id FROM terms t, (VALUES ('${csMat}'::uuid),('${csPor}'::uuid)) v(cs);
-- Ana: todas as notas. Beto: falta Português no 3.º período.
INSERT INTO test_averages SELECT gb.id, '${ana}', 12 FROM gradebooks gb;
INSERT INTO test_averages SELECT gb.id, '${beto}', 14 FROM gradebooks gb
  JOIN terms t ON t.id = gb.term_id WHERE NOT (gb.class_subject_id = '${csPor}' AND t.name = 'T3');
`);

const build = () =>
  db.query(`select private.build_grade_sheet($1,$2,null,'annual')`, [school, group]);
const rows = async () =>
  Object.fromEntries(
    (
      await db.query("select enrollment_id, result, subject_breakdown from grade_sheet_rows")
    ).rows.map((r) => [r.enrollment_id, r]),
  );

await build();
let r = await rows();
assert.equal(r[ana].result, "pass", "com as três notas transita");
assert.equal(
  r[beto].result,
  "incomplete",
  "sem a nota de Português no 3.º período fica incompleta",
);
assert.ok(
  r[ana].subject_breakdown.every((e) => e.termId),
  "cada entrada leva termId",
);

// A nota em falta chega: a pauta refeita decide normalmente.
await db.exec(`INSERT INTO test_averages SELECT gb.id, '${beto}', 14 FROM gradebooks gb
  JOIN terms t ON t.id = gb.term_id WHERE gb.class_subject_id = '${csPor}' AND t.name = 'T3'`);
await build();
r = await rows();
assert.equal(r[beto].result, "pass");

// Excluído por faltas continua «fail», mesmo incompleto.
await db.exec(`DELETE FROM test_averages WHERE enrollment_id = '${beto}' AND gradebook_id IN (
  SELECT gb.id FROM gradebooks gb JOIN terms t ON t.id = gb.term_id WHERE gb.class_subject_id = '${csMat}' AND t.name = 'T2');
INSERT INTO siga_attendance_sessions VALUES ('00000000-0000-0000-0000-0000000000b1','${school}','${group}');
INSERT INTO siga_attendance_records SELECT '${school}','00000000-0000-0000-0000-0000000000b1', student_id, 'absent' FROM enrollments WHERE id = '${beto}';`);
await build();
r = await rows();
assert.equal(r[beto].result, "fail", "faltas acima do limite decidem antes");

// Pauta de período não muda: sem exigência de três notas.
const t1 = (await db.query("select id from terms where name = 'T1'")).rows[0].id;
await db.query(`select private.build_grade_sheet($1,$2,$3,'term')`, [school, group, t1]);
const term = await db.query(
  "select r.result from grade_sheet_rows r join grade_sheets s on s.id = r.grade_sheet_id where s.kind = 'term' and r.enrollment_id = $1",
  [ana],
);
assert.equal(term.rows[0].result, "pass");

console.log("annual-sheet-terms: OK");
