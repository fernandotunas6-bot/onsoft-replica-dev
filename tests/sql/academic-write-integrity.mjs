// SQL real em PGlite, com dados sintéticos; não toca na produção.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.SIGA_SQL_TEST_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [school, actor, group, year, term, item, subject, cs, task, sub, e1, e2, other] = Array.from(
  { length: 13 },
  (_, i) => id(i + 1),
);
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.schools(id uuid PRIMARY KEY, status text);
CREATE TABLE public.school_memberships(school_id uuid, user_id uuid, status text);
CREATE TABLE public.class_groups(id uuid PRIMARY KEY, school_id uuid, academic_year_id uuid);
CREATE TABLE public.terms(id uuid PRIMARY KEY, school_id uuid, academic_year_id uuid, sequence integer);
CREATE TABLE public.school_settings(school_id uuid, domain text, value jsonb);
CREATE TABLE public.grade_sheets(id uuid PRIMARY KEY, school_id uuid, class_group_id uuid, kind text, term_id uuid, status text);
CREATE TABLE public.siga_assessment_items(id uuid PRIMARY KEY, school_id uuid, class_group_id uuid, subject_id uuid, term integer, max_score numeric);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY, school_id uuid, class_group_id uuid);
CREATE TABLE public.class_subjects(id uuid PRIMARY KEY, school_id uuid, class_group_id uuid, subject_id uuid);
CREATE TABLE public.siga_class_tasks(id uuid PRIMARY KEY, school_id uuid, class_subject_id uuid, assessment_item_id uuid);
CREATE TABLE public.siga_assessment_scores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, item_id uuid, enrollment_id uuid,
 score numeric, previous_score numeric, recorded_by uuid, updated_at timestamptz, UNIQUE(item_id,enrollment_id));
CREATE TABLE public.siga_class_task_submissions(id uuid PRIMARY KEY, school_id uuid, task_id uuid, enrollment_id uuid,
 status text, grade numeric, feedback text, returned_at timestamptz, graded_by uuid, updated_by uuid);
CREATE TABLE public.audit_logs(id uuid DEFAULT gen_random_uuid(), school_id uuid, actor_user_id uuid, action text, entity_type text, entity_id uuid, metadata jsonb);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO schools VALUES ('${school}','active'), ('${other}','active');
INSERT INTO school_memberships VALUES ('${school}','${actor}','active');
INSERT INTO class_groups VALUES ('${group}','${school}','${year}');
INSERT INTO terms VALUES ('${term}','${school}','${year}',1);
INSERT INTO school_settings VALUES ('${school}','pedagogy','{"closedTerms":[]}');
INSERT INTO siga_assessment_items VALUES ('${item}','${school}','${group}','${subject}',1,20);
INSERT INTO enrollments VALUES ('${e1}','${school}','${group}'),('${e2}','${school}','${group}');
INSERT INTO class_subjects VALUES ('${cs}','${school}','${group}','${subject}');
INSERT INTO siga_class_tasks VALUES ('${task}','${school}','${cs}','${item}');
INSERT INTO siga_class_task_submissions(id,school_id,task_id,enrollment_id,status) VALUES ('${sub}','${school}','${task}','${e1}','submitted');
`);
await db.exec(`
ALTER TABLE class_groups ADD COLUMN status text DEFAULT 'active';
ALTER TABLE enrollments ADD COLUMN student_id uuid, ADD COLUMN academic_year_id uuid, ADD COLUMN status text DEFAULT 'active', ADD COLUMN updated_by uuid;
UPDATE enrollments SET student_id=id, academic_year_id='${year}';
CREATE TABLE grade_scores(school_id uuid,enrollment_id uuid);
CREATE TABLE grade_sheet_rows(school_id uuid,enrollment_id uuid);
CREATE TABLE attendance_records(school_id uuid,enrollment_id uuid);
CREATE TABLE report_cards(school_id uuid,enrollment_id uuid);
CREATE TABLE siga_attendance_sessions(id uuid PRIMARY KEY,school_id uuid,class_group_id uuid,academic_year_id uuid);
CREATE TABLE siga_attendance_records(id uuid PRIMARY KEY,school_id uuid,session_id uuid,student_id uuid);
INSERT INTO class_groups VALUES ('${id(60)}','${school}','${year}','active');
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
`);
const migration = readFileSync(
  new URL("../../supabase/migrations/20261026110424_academic_write_integrity.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);
const as = async (role, sql, args = []) => {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await db.query(sql, args);
  } finally {
    await db.exec("RESET ROLE");
  }
};
const write = (rows, schoolId = school) =>
  as("service_role", "SELECT public.siga_write_assessment_scores_atomic($1,$2,$3,$4)", [
    schoolId,
    actor,
    item,
    JSON.stringify(rows),
  ]);
const ret = (grade = 15, feedback = null) =>
  as("service_role", "SELECT public.siga_return_task_submission_atomic($1,$2,$3,$4,$5,$6) result", [
    school,
    actor,
    task,
    sub,
    grade,
    feedback,
  ]);
const score = async () =>
  (await db.query("SELECT score FROM siga_assessment_scores WHERE enrollment_id=$1", [e1])).rows[0]
    ?.score;
for (const role of ["anon", "authenticated"]) {
  await assert.rejects(
    as(role, "SELECT public.siga_write_assessment_scores_atomic($1,$2,$3,$4)", [
      school,
      actor,
      item,
      "[]",
    ]),
    /permission denied/,
  );
  await assert.rejects(
    as(role, "SELECT public.siga_return_task_submission_atomic($1,$2,$3,$4,$5,$6)", [
      school,
      actor,
      task,
      sub,
      15,
      null,
    ]),
    /permission denied/,
  );
}
await assert.rejects(write([{ enrollmentId: e1, score: 15 }], other), /vínculo/);
await write([{ enrollmentId: e1, score: null }]);
await write([{ enrollmentId: e1, score: 0 }]);
await write([{ enrollmentId: e1, score: null }]);
assert.equal(
  (
    await db.query(
      "SELECT count(*)::int n FROM audit_logs WHERE action='grades.assessment_score_changed'",
    )
  ).rows[0].n,
  2,
  "null ↔ zero tem duas alterações",
);
await assert.rejects(
  write([
    { enrollmentId: e1, score: 12 },
    { enrollmentId: e2, score: 21 },
  ]),
  /cotação/,
);
assert.equal(await score(), null, "a segunda nota inválida desfaz a primeira");
await assert.rejects(
  write([
    { enrollmentId: e1, score: 12 },
    { enrollmentId: e1, score: 13 },
  ]),
  /repetidas/,
);
await db.exec(`UPDATE school_settings SET value='{"closedTerms":[1]}'`);
await assert.rejects(ret(), /fechado/);
assert.equal(await score(), null);
await db.exec(`UPDATE school_settings SET value='{"closedTerms":[]}'`);
await db.exec(
  `INSERT INTO grade_sheets VALUES ('${id(50)}','${school}','${group}','term','${term}','homologated')`,
);
await assert.rejects(ret(), /oficial/);
await db.exec("DELETE FROM grade_sheets");
// Falha na auditoria: nem nota nem devolução escapam à transacção.
await db.exec(`CREATE FUNCTION public.reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failed'; END $$;
CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION public.reject_audit();`);
await assert.rejects(ret(), /audit failed/);
assert.equal(await score(), null);
assert.equal(
  (await db.query("SELECT status FROM siga_class_task_submissions")).rows[0].status,
  "submitted",
);
await db.exec("DROP TRIGGER reject_audit ON audit_logs");
// Falha exactamente depois da nota, ao actualizar a entrega.
await db.exec(`CREATE FUNCTION public.reject_return() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'return failed'; END $$;
CREATE TRIGGER reject_return BEFORE UPDATE ON siga_class_task_submissions FOR EACH ROW EXECUTE FUNCTION public.reject_return();`);
await assert.rejects(ret(), /return failed/);
assert.equal(await score(), null);
await db.exec("DROP TRIGGER reject_return ON siga_class_task_submissions");
const result = await ret();
assert.deepEqual(result.rows[0].result, { pauta: true, changed: true });
assert.equal(await score(), "15");
assert.deepEqual(
  (await ret()).rows[0].result,
  { pauta: true, changed: false },
  "retry não reescreve nem renotifica",
);
await assert.rejects(ret(18), /já foi devolvida/);
assert.equal(await score(), "15");
await db.exec(
  `UPDATE siga_class_task_submissions SET status='submitted'; UPDATE siga_assessment_items SET subject_id='${other}'`,
);
await assert.rejects(ret(), /disciplina da tarefa/);
await db.exec(`UPDATE siga_assessment_items SET subject_id='${subject}';
UPDATE siga_class_tasks SET assessment_item_id=NULL;
UPDATE siga_class_task_submissions SET status='submitted';`);
assert.deepEqual((await ret(14)).rows[0].result, { pauta: false, changed: true });
await db.exec(`UPDATE siga_class_tasks SET assessment_item_id='${item}'`);
assert.deepEqual(
  (await ret(14)).rows[0].result,
  { pauta: false, changed: false },
  "ligar depois não equivale a sincronizar a nota",
);
const move = () =>
  as("service_role", "SELECT siga_reorganize_enrollment_guarded($1,$2,$3,$4,$5)", [
    school,
    actor,
    e2,
    group,
    id(60),
  ]);
await db.exec(`INSERT INTO siga_attendance_sessions VALUES ('${id(70)}','${school}','${group}','${year}');
INSERT INTO siga_attendance_records VALUES ('${id(71)}','${school}','${id(70)}','${e2}');`);
await assert.rejects(move(), /registos académicos/);
assert.equal(
  (await db.query("SELECT class_group_id FROM enrollments WHERE id=$1", [e2])).rows[0]
    .class_group_id,
  group,
);
await db.exec("DELETE FROM siga_attendance_records");
await move();
assert.equal(
  (await db.query("SELECT class_group_id FROM enrollments WHERE id=$1", [e2])).rows[0]
    .class_group_id,
  id(60),
);
await assert.rejects(move(), /matrícula mudou/);
for (const role of ["anon", "authenticated"])
  await assert.rejects(
    as(role, "SELECT siga_reorganize_enrollment_guarded($1,$2,$3,$4,$5)", [
      school,
      actor,
      e2,
      group,
      id(60),
    ]),
    /permission denied/,
  );
await db.close();
console.log(
  "PASS: duas aplicações, permissões, âmbito, null/zero, rollback do lote/auditoria/devolução, período, pauta, retry e vínculo da tarefa. Não ensaia concorrência entre conexões.",
);
