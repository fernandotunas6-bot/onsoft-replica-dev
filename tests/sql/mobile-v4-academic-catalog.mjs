// Local PostgreSQL (PGlite) integration of the actual Mobile scope + projection.
// Column subsets/types match the Sga catalog inspected read-only on 2026-10-09.
// The adapter translates the Supabase query subset into parameterized SQL.
// Does not test PostgREST, Auth, production RLS, concurrent transactions or E2E.
import assert from "node:assert/strict";
import { register } from "node:module";
const { PGlite } = await import(process.env.SIGA_SQL_TEST_MODULE_PATH || "@electric-sql/pglite");
const SRC = new URL("../../src/", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const SRC = ${JSON.stringify(SRC)};
export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith('@/')) base = new URL(specifier.slice(2), SRC).href;
  else if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith(SRC))
    base = new URL(specifier, context.parentURL).href;
  if (base) { for (const ext of ['.ts', '.tsx', '/index.ts']) { try { return await next(base + ext, context); } catch {} } }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith(SRC) && url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
    source: stripTypeScriptTypes(await readFile(new URL(url), 'utf8'), { mode: 'transform' }) };
  return next(url, context);
}
`),
);
const { resolveMobileAcademicScope } = await import(
  new URL("../../src/features/mobile-v4/academic-scope.server.ts", import.meta.url)
);
const { readMobileAcademicCatalog } = await import(
  new URL("../../src/features/mobile-v4/academic-catalog.server.ts", import.meta.url)
);
const { parseAcademicCatalog } = await import(
  new URL("../../mobile-v4/src/domain/catalog-validation.ts", import.meta.url)
);
const pg = new PGlite();
await pg.exec(`
CREATE TABLE people(id uuid PRIMARY KEY, school_id uuid NOT NULL, full_name text NOT NULL, user_id uuid, status text NOT NULL, deleted_at timestamptz);
CREATE TABLE students(id uuid PRIMARY KEY, school_id uuid NOT NULL, person_id uuid NOT NULL, status text NOT NULL, deleted_at timestamptz);
CREATE TABLE teachers(id uuid PRIMARY KEY, school_id uuid NOT NULL, person_id uuid NOT NULL, user_id uuid, status text NOT NULL);
CREATE TABLE academic_years(id uuid PRIMARY KEY, school_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE class_groups(id uuid PRIMARY KEY, school_id uuid NOT NULL, academic_year_id uuid NOT NULL, name text NOT NULL, status text NOT NULL);
CREATE TABLE subjects(id uuid PRIMARY KEY, school_id uuid NOT NULL, name text NOT NULL, status text NOT NULL, deleted_at timestamptz);
CREATE TABLE class_subjects(id uuid PRIMARY KEY, school_id uuid NOT NULL, class_group_id uuid NOT NULL, subject_id uuid NOT NULL, teacher_id uuid, status text NOT NULL);
CREATE TABLE enrollments(id uuid PRIMARY KEY, school_id uuid NOT NULL, academic_year_id uuid NOT NULL, class_group_id uuid NOT NULL, student_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE academic_schedules(id uuid PRIMARY KEY, school_id uuid NOT NULL, academic_year_id uuid NOT NULL, class_group_id uuid NOT NULL, status text NOT NULL, valid_from date, valid_to date, deleted_at timestamptz);
CREATE TABLE rooms(id uuid PRIMARY KEY, school_id uuid NOT NULL, name text NOT NULL, status text NOT NULL, deleted_at timestamptz);
CREATE TABLE timetable_slots(id uuid PRIMARY KEY, school_id uuid NOT NULL, class_subject_id uuid NOT NULL, schedule_id uuid, weekday smallint NOT NULL CHECK(weekday BETWEEN 1 AND 7), starts_at time NOT NULL, ends_at time NOT NULL, room text NOT NULL, room_id uuid, status text NOT NULL);
CREATE TABLE siga_class_tasks(id uuid PRIMARY KEY, school_id uuid NOT NULL, class_subject_id uuid NOT NULL, timetable_slot_id uuid, kind text NOT NULL, title text NOT NULL, description text, due_on date, status text NOT NULL);
`);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = uuid(1),
  B = uuid(2),
  studentUser = uuid(3),
  teacherUser = uuid(4),
  peerUser = uuid(5),
  unrelatedTeacherUser = uuid(6);
const yearA = uuid(10),
  yearB = uuid(11),
  groupA = uuid(12),
  groupB = uuid(13),
  unrelatedGroup = uuid(14);
const student = uuid(20),
  peer = uuid(21),
  teacher = uuid(22),
  otherTeacher = uuid(23),
  foreignStudent = uuid(24);
const personStudent = uuid(30),
  personPeer = uuid(31),
  personTeacher = uuid(32),
  personOtherTeacher = uuid(33),
  personForeign = uuid(34);
const subjectA = uuid(40),
  subjectB = uuid(41),
  csA = uuid(42),
  csB = uuid(43),
  unrelatedCs = uuid(44);
const enrollment = uuid(50),
  peerEnrollment = uuid(51),
  foreignEnrollment = uuid(52),
  unrelatedEnrollment = uuid(53);
const publishedSchedule = uuid(60),
  draftSchedule = uuid(61),
  room = uuid(62),
  slot = uuid(63),
  draftSlot = uuid(64),
  legacySlot = uuid(65),
  task = uuid(70);

async function insert(table, row) {
  const fields = Object.keys(row);
  await pg.query(
    `INSERT INTO ${table} (${fields.join(",")}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(",")})`,
    Object.values(row),
  );
}
for (const [id, school_id, full_name, user_id] of [
  [personStudent, A, "Aluno próprio", studentUser],
  [personPeer, A, "Colega privado", peerUser],
  [personTeacher, A, "Docente atribuído", teacherUser],
  [personOtherTeacher, A, "Outro docente", unrelatedTeacherUser],
  [personForeign, B, "Pessoa de outra escola", studentUser],
])
  await insert("people", { id, school_id, full_name, user_id, status: "active", deleted_at: null });
for (const [id, school_id, person_id] of [
  [student, A, personStudent],
  [peer, A, personPeer],
  [foreignStudent, B, personForeign],
])
  await insert("students", { id, school_id, person_id, status: "active", deleted_at: null });
for (const [id, person_id, user_id] of [
  [teacher, personTeacher, teacherUser],
  [otherTeacher, personOtherTeacher, unrelatedTeacherUser],
])
  await insert("teachers", { id, school_id: A, person_id, user_id, status: "active" });
for (const [id, school_id] of [
  [yearA, A],
  [yearB, B],
])
  await insert("academic_years", { id, school_id, status: "active" });
for (const [id, school_id, academic_year_id, name] of [
  [groupA, A, yearA, "Turma A"],
  [groupB, B, yearB, "Turma B"],
  [unrelatedGroup, A, yearA, "Turma sem atribuição"],
])
  await insert("class_groups", { id, school_id, academic_year_id, name, status: "active" });
for (const [id, school_id, name] of [
  [subjectA, A, "Matemática"],
  [subjectB, B, "Disciplina privada"],
])
  await insert("subjects", { id, school_id, name, status: "active", deleted_at: null });
for (const [id, school_id, class_group_id, subject_id, teacher_id] of [
  [csA, A, groupA, subjectA, teacher],
  [csB, B, groupB, subjectB, null],
  [unrelatedCs, A, unrelatedGroup, subjectA, otherTeacher],
])
  await insert("class_subjects", {
    id,
    school_id,
    class_group_id,
    subject_id,
    teacher_id,
    status: "active",
  });
for (const [id, school_id, academic_year_id, class_group_id, student_id] of [
  [enrollment, A, yearA, groupA, student],
  [peerEnrollment, A, yearA, groupA, peer],
  [foreignEnrollment, B, yearB, groupB, foreignStudent],
  [unrelatedEnrollment, A, yearA, unrelatedGroup, peer],
])
  await insert("enrollments", {
    id,
    school_id,
    academic_year_id,
    class_group_id,
    student_id,
    status: "active",
  });
for (const [id, status] of [
  [publishedSchedule, "published"],
  [draftSchedule, "draft"],
])
  await insert("academic_schedules", {
    id,
    school_id: A,
    academic_year_id: yearA,
    class_group_id: groupA,
    status,
    valid_from: "2026-10-01",
    valid_to: null,
    deleted_at: null,
  });
await insert("rooms", {
  id: room,
  school_id: A,
  name: "Sala institucional",
  status: "active",
  deleted_at: null,
});
for (const [id, schedule_id, weekday, room_id] of [
  [slot, publishedSchedule, 1, room],
  [draftSlot, draftSchedule, 2, null],
  [legacySlot, null, 7, null],
])
  await insert("timetable_slots", {
    id,
    school_id: A,
    class_subject_id: csA,
    schedule_id,
    weekday,
    starts_at: "08:00",
    ends_at: "09:00",
    room: room_id ? "Texto antigo" : "Sala indicada",
    room_id,
    status: "active",
  });
for (const [id, timetable_slot_id, status] of [
  [task, slot, "published"],
  [uuid(71), draftSlot, "published"],
  [uuid(72), null, "archived"],
])
  await insert("siga_class_tasks", {
    id,
    school_id: A,
    class_subject_id: csA,
    timetable_slot_id,
    kind: "trabalho",
    title: "Trabalho real do fixture",
    description: null,
    due_on: null,
    status,
  });

const calls = [];
const identifier = (value) => {
  assert.match(value, /^[a-z_]+$/);
  return `"${value}"`;
};
function adapter({ fail, cap } = {}) {
  return {
    from(table) {
      identifier(table);
      const filters = [],
        values = [];
      let fields = [],
        maximum = 1000;
      calls.push({ table, filters });
      function eq(field, value) {
        values.push(value);
        filters.push(`${identifier(field)}=$${values.length}`);
        return chain;
      }
      async function execute(single = false) {
        if (table === fail)
          return { data: null, error: { message: "injected unavailable database" }, count: null };
        try {
          const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
          const total = await pg.query(
            `SELECT count(*)::int AS n FROM ${identifier(table)}${where}`,
            values,
          );
          const result = await pg.query(
            `SELECT ${fields.map(identifier).join(",")} FROM ${identifier(table)}${where} LIMIT ${Number(maximum)}`,
            values,
          );
          const count = total.rows[0].n;
          if (single && count > 1) return { data: null, error: { code: "PGRST116" }, count };
          // Match PostgREST date encoding; PGlite returns SQL dates as Date objects.
          const encoded = result.rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([key, value]) => [
                key,
                value instanceof Date ? value.toISOString().slice(0, 10) : value,
              ]),
            ),
          );
          return {
            data: single ? (encoded[0] ?? null) : table === cap ? [] : encoded,
            error: null,
            count,
          };
        } catch (error) {
          return { data: null, error, count: null };
        }
      }
      const chain = {
        select(selection) {
          fields = selection.split(",").map((v) => v.trim());
          return chain;
        },
        eq,
        is(field, value) {
          assert.equal(value, null);
          filters.push(`${identifier(field)} IS NULL`);
          return chain;
        },
        in(field, items) {
          assert.ok(items.length);
          const placeholders = items.map((value) => {
            values.push(value);
            return `$${values.length}`;
          });
          filters.push(`${identifier(field)} IN (${placeholders.join(",")})`);
          return chain;
        },
        limit(value) {
          maximum = value;
          return chain;
        },
        maybeSingle() {
          return execute(true);
        },
        then(resolve, reject) {
          return execute().then(resolve, reject);
        },
      };
      return chain;
    },
  };
}
const db = adapter();
async function catalog(userId, schoolId, role) {
  const scope = await resolveMobileAcademicScope(db, userId, schoolId, role);
  return readMobileAcademicCatalog(db, scope, userId);
}
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
try {
  const teacherData = await catalog(teacherUser, A, "professor");
  check(teacherData.classes.length === 1, "teacher sees only assigned discipline");
  check(
    teacherData.classes[0].students.length === 2,
    "teacher roster contains own assigned class only",
  );
  check(
    teacherData.classes[0].classSubjectId === csA && teacherData.classes[0].classGroupId === groupA,
    "canonical IDs preserved",
  );
  check(teacherData.classes[0].subjectName === "Matemática", "real subject name");
  const studentData = await catalog(studentUser, A, "aluno");
  check(
    parseAcademicCatalog(JSON.parse(JSON.stringify(studentData)), {
      userId: studentUser,
      schoolId: A,
      role: "aluno",
    }).classes[0].classSubjectId === csA,
    "actual SQL projection satisfies the Mobile client contract after JSON transport",
  );
  check(
    parseAcademicCatalog(JSON.parse(JSON.stringify(teacherData)), {
      userId: teacherUser,
      schoolId: A,
      role: "professor",
    }).classes[0].students.length === 2,
    "teacher projection satisfies the same client contract",
  );
  check(
    studentData.classes[0].students.length === 1 &&
      studentData.classes[0].students[0].studentId === student,
    "student sees own enrollment only",
  );
  check(
    !JSON.stringify(studentData).includes("Colega privado") &&
      !JSON.stringify(studentData).includes(peerUser),
    "no classmate profile or account leak",
  );
  check(
    !JSON.stringify(studentData).includes("Pessoa de outra escola") &&
      !JSON.stringify(studentData).includes(subjectB),
    "no other-school projection",
  );
  check(
    studentData.timetable.length === 2 &&
      !studentData.timetable.some((s) => s.slotId === draftSlot),
    "draft schedule excluded",
  );
  check(
    studentData.timetable.find((s) => s.slotId === slot).publication === "published",
    "published schedule provenance",
  );
  check(
    studentData.timetable.find((s) => s.slotId === legacySlot).publication === "legacy" &&
      studentData.timetable.find((s) => s.slotId === legacySlot).validFrom === null,
    "legacy schedule not falsely published",
  );
  check(
    studentData.timetable.find((s) => s.slotId === legacySlot).weekday === 7,
    "ISO Sunday preserved",
  );
  check(
    studentData.timetable.find((s) => s.slotId === slot).room === "Sala institucional",
    "canonical room name",
  );
  check(
    studentData.tasks.length === 1 && studentData.tasks[0].id === task,
    "only published visible-slot tasks",
  );
  check(
    studentData.tasks[0].instructions === null && studentData.tasks[0].due === null,
    "null institutional fields are not invented",
  );
  check(
    calls.every((c) => c.filters.some((f) => f.startsWith('"school_id"='))),
    "all queries have explicit tenant filters",
  );
  const foreignData = await catalog(studentUser, B, "aluno");
  check(
    foreignData.classes.length === 1 && foreignData.classes[0].classSubjectId === csB,
    "same account in another school remains isolated",
  );
  const scope = await resolveMobileAcademicScope(db, teacherUser, A, "professor");
  await pg.query("UPDATE academic_schedules SET valid_from=NULL WHERE id=$1", [publishedSchedule]);
  const unknownStart = await readMobileAcademicCatalog(db, scope, teacherUser);
  check(
    parseAcademicCatalog(unknownStart, {
      userId: teacherUser,
      schoolId: A,
      role: "professor",
    }).timetable.find((s) => s.slotId === slot).validFrom === null,
    "nullable published schedule validity is preserved through both contracts",
  );
  await pg.query("UPDATE academic_schedules SET valid_from='2026-10-01' WHERE id=$1", [
    publishedSchedule,
  ]);
  await assert.rejects(
    readMobileAcademicCatalog(adapter({ cap: "subjects" }), scope, teacherUser),
    (e) => e.status === 503,
  );
  checks++;
  await assert.rejects(
    readMobileAcademicCatalog(adapter({ fail: "siga_class_tasks" }), scope, teacherUser),
    (e) => e.code === "ACADEMIC_CATALOG_UNAVAILABLE",
  );
  checks++;
  await pg.query("UPDATE class_subjects SET teacher_id=$1 WHERE id=$2", [otherTeacher, csA]);
  await assert.rejects(
    readMobileAcademicCatalog(db, scope, teacherUser),
    (e) => e.code === "ACADEMIC_SCOPE_CHANGED",
  );
  checks++;
  await pg.query("UPDATE class_subjects SET teacher_id=$1 WHERE id=$2", [teacher, csA]);
  const studentScope = await resolveMobileAcademicScope(db, studentUser, A, "aluno");
  await pg.query("UPDATE people SET user_id=$1 WHERE id=$2", [peerUser, personStudent]);
  await assert.rejects(
    readMobileAcademicCatalog(db, studentScope, studentUser),
    (e) => e.code === "ACADEMIC_SCOPE_CHANGED",
  );
  checks++;
  await pg.query("UPDATE people SET user_id=$1 WHERE id=$2", [studentUser, personStudent]);
  await pg.query("UPDATE academic_years SET status='closed' WHERE id=$1", [yearA]);
  await assert.rejects(
    readMobileAcademicCatalog(db, scope, teacherUser),
    (e) => e.code === "ACADEMIC_SCOPE_CHANGED",
  );
  checks++;
  await pg.query("UPDATE academic_years SET status='active' WHERE id=$1", [yearA]);
  await pg.query("UPDATE rooms SET school_id=$1 WHERE id=$2", [B, room]);
  await assert.rejects(
    readMobileAcademicCatalog(db, scope, teacherUser),
    (e) => e.code === "ACADEMIC_CATALOG_INCONSISTENT",
  );
  checks++;
  await pg.query("UPDATE rooms SET school_id=$1 WHERE id=$2", [A, room]);
  await pg.query("UPDATE subjects SET deleted_at=now() WHERE id=$1", [subjectA]);
  await assert.rejects(
    readMobileAcademicCatalog(db, scope, teacherUser),
    (e) => e.code === "ACADEMIC_CATALOG_INCONSISTENT",
  );
  checks++;
  console.log(
    `Mobile V4 academic catalog: ${checks} local PostgreSQL checks passed (no production access).`,
  );
} finally {
  await pg.close();
}
