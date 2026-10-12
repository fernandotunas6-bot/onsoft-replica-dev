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
    source: stripTypeScriptTypes((await readFile(new URL(url), 'utf8')).replaceAll('import.meta.env', '({})'), { mode: 'transform' }) };
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
const { readMobileAttendance } = await import(
  new URL("../../src/features/mobile-v4/attendance.server.ts", import.meta.url)
);
const { parseAcademicAttendance } = await import(
  new URL("../../mobile-v4/src/domain/attendance-validation.ts", import.meta.url)
);
const { readMobileResults } = await import(
  new URL("../../src/features/mobile-v4/results.server.ts", import.meta.url)
);
const { readMobileGradebooks } = await import(
  new URL("../../src/features/mobile-v4/gradebooks.server.ts", import.meta.url)
);
const { readMobileFinance } = await import(
  new URL("../../src/features/mobile-v4/finance.server.ts", import.meta.url)
);
const { readMobileChat } = await import(
  new URL("../../src/features/mobile-v4/chat.server.ts", import.meta.url)
);
const { readMobileChatContacts, signMobileChatAttachment } = await import(
  new URL("../../src/features/mobile-v4/chat-files.server.ts", import.meta.url)
);
const { readMobileNotifications, markMobileNotificationsRead } = await import(
  new URL("../../src/features/mobile-v4/notifications.server.ts", import.meta.url)
);
const pg = new PGlite();
await pg.exec(`
CREATE TABLE notifications(id uuid PRIMARY KEY,school_id uuid NOT NULL,user_id uuid NOT NULL,channel text NOT NULL,event_type text NOT NULL,title text NOT NULL,body text NOT NULL,status text NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL);
CREATE TABLE member_roles(membership_id uuid,role_id uuid);
CREATE TABLE roles(id uuid PRIMARY KEY,code text);
CREATE TABLE siga_files(id uuid PRIMARY KEY,school_id uuid,name text,area text,visibility text,owner_user_id uuid,related_user_id uuid,is_folder boolean,is_system boolean,storage_backend text,storage_path text,deleted_at timestamptz);
CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text);
CREATE TABLE school_memberships(id uuid PRIMARY KEY,school_id uuid,user_id uuid,status text);
CREATE TABLE siga_chat_conversations(id uuid PRIMARY KEY,school_id uuid,type text,title text);
CREATE TABLE siga_chat_members(conversation_id uuid,user_id uuid,last_read_at timestamptz,PRIMARY KEY(conversation_id,user_id));
CREATE TABLE siga_chat_messages(id uuid PRIMARY KEY,school_id uuid,conversation_id uuid,sender_id uuid,body text,created_at timestamptz,deleted_at timestamptz,reply_to uuid,attachment_file_id uuid,attachment_file_name text);
CREATE TABLE finance_contracts(id uuid PRIMARY KEY,school_id uuid NOT NULL,enrollment_id uuid NOT NULL,status text);
CREATE TABLE fee_items(id uuid PRIMARY KEY,school_id uuid NOT NULL,name text NOT NULL);
CREATE TABLE finance_invoices(id uuid PRIMARY KEY,school_id uuid NOT NULL,contract_id uuid NOT NULL,fee_item_id uuid NOT NULL,invoice_number text NOT NULL,competence_month date,due_date date,status text,amount numeric(18,2),discount_amount numeric(18,2),penalty_amount numeric);
CREATE TABLE finance_receipts(id uuid PRIMARY KEY,school_id uuid NOT NULL,invoice_id uuid NOT NULL,receipt_number text NOT NULL,amount numeric(18,2),paid_on date,payment_method text,status text);
CREATE TABLE terms(id uuid PRIMARY KEY,school_id uuid NOT NULL,academic_year_id uuid NOT NULL,name text NOT NULL,sequence smallint CHECK(sequence>0));
CREATE TABLE gradebooks(id uuid PRIMARY KEY,school_id uuid NOT NULL,class_subject_id uuid NOT NULL,class_group_id uuid NOT NULL,academic_year_id uuid NOT NULL,term_id uuid NOT NULL,status text CHECK(status IN ('draft','open','submitted','closed')));
CREATE TABLE grade_items(id uuid PRIMARY KEY,school_id uuid NOT NULL,gradebook_id uuid NOT NULL,code text NOT NULL,name text NOT NULL,kind text NOT NULL,max_score numeric(6,2) CHECK(max_score>0),sequence smallint CHECK(sequence>0),assessed_on date);
CREATE TABLE grade_scores(id uuid PRIMARY KEY,school_id uuid NOT NULL,grade_item_id uuid NOT NULL,enrollment_id uuid NOT NULL,score numeric(6,2),status text CHECK(status IN ('draft','submitted','locked')),note text,pending_score numeric, UNIQUE(school_id,grade_item_id,enrollment_id));
CREATE TABLE grade_sheets(id uuid PRIMARY KEY, school_id uuid NOT NULL, class_group_id uuid NOT NULL, academic_year_id uuid NOT NULL, title text NOT NULL, kind text CHECK(kind IN ('term','annual')), status text CHECK(status IN ('draft','submitted','in_review','homologated','published','contested','rectified','closed')), published_at timestamptz);
CREATE TABLE grade_sheet_rows(id uuid PRIMARY KEY, school_id uuid NOT NULL, grade_sheet_id uuid NOT NULL, enrollment_id uuid NOT NULL, continuous_average numeric, exam_average numeric, term_average numeric, result text CHECK(result IN ('pending','pass','fail','incomplete')), observation text, subject_breakdown jsonb, UNIQUE(school_id,grade_sheet_id,enrollment_id));
CREATE TABLE siga_attendance_sessions(id uuid PRIMARY KEY, school_id uuid NOT NULL, class_group_id uuid NOT NULL, subject_id uuid NOT NULL, academic_year_id uuid, teacher_id uuid, lesson_date date NOT NULL, starts_at text, ends_at text, status text CHECK(status IN ('pending','completed','cancelled')));
CREATE TABLE siga_attendance_records(id uuid PRIMARY KEY, school_id uuid NOT NULL, session_id uuid NOT NULL, student_id uuid NOT NULL, status text CHECK(status IN ('present','absent','excused','late','early_exit','not_registered')));
CREATE TABLE hr_teacher_lesson_occurrences(id uuid PRIMARY KEY, school_id uuid NOT NULL, teacher_id uuid NOT NULL, class_subject_id uuid NOT NULL, lesson_date date NOT NULL, scheduled_starts_at time NOT NULL, scheduled_ends_at time NOT NULL, status text CHECK(status IN ('scheduled','confirmed','rejected','cancelled')), deleted_at timestamptz);
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
        maximum = 1000,
        head = false,
        changes = null;
      const ordering = [];
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
          if (changes) {
            // UPDATE … RETURNING, como o PostgREST faz com update().select().
            const keys = Object.keys(changes);
            const set = keys.map((key, i) => `${identifier(key)}=$${values.length + i + 1}`);
            const updated = await pg.query(
              `UPDATE ${identifier(table)} SET ${set.join(",")}${where} RETURNING ${fields.map(identifier).join(",") || "id"}`,
              [...values, ...keys.map((key) => changes[key])],
            );
            return { data: updated.rows, error: null, count: null };
          }
          const total = await pg.query(
            `SELECT count(*)::int AS n FROM ${identifier(table)}${where}`,
            values,
          );
          if (head) return { data: null, error: null, count: total.rows[0].n };
          const result = await pg.query(
            `SELECT ${fields.map((f) => (["created_at", "last_read_at"].includes(f) ? `${identifier(f)}::text AS ${identifier(f)}` : identifier(f))).join(",")} FROM ${identifier(table)}${where}${ordering.length ? ` ORDER BY ${ordering.join(",")}` : ""} LIMIT ${Number(maximum)}`,
            values,
          );
          const count = total.rows[0].n;
          if (single && count > 1) return { data: null, error: { code: "PGRST116" }, count };
          // Match PostgREST date encoding; PGlite returns SQL dates as Date objects.
          const encoded = result.rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([key, value]) => [
                key,
                [
                  "continuous_average",
                  "exam_average",
                  "term_average",
                  "score",
                  "max_score",
                  "amount",
                  "discount_amount",
                  "penalty_amount",
                ].includes(key) && value !== null
                  ? Number(value)
                  : value instanceof Date
                    ? ![
                        "lesson_date",
                        "valid_from",
                        "valid_to",
                        "due_on",
                        "assessed_on",
                        "due_date",
                        "competence_month",
                        "paid_on",
                      ].includes(key)
                      ? value.toISOString()
                      : value.toISOString().slice(0, 10)
                    : value,
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
        update(next) {
          changes = next;
          return chain;
        },
        select(selection, options = {}) {
          head = !!options.head;
          fields = selection.split(",").map((v) => v.trim());
          return chain;
        },
        eq,
        neq(field, value) {
          values.push(value);
          filters.push(`${identifier(field)}<>$${values.length}`);
          return chain;
        },
        gt(field, value) {
          values.push(value);
          filters.push(`${identifier(field)}>$${values.length}`);
          return chain;
        },
        order(field, options) {
          ordering.push(`${identifier(field)} ${options?.ascending === false ? "DESC" : "ASC"}`);
          return chain;
        },
        or(expression) {
          const match =
            /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([0-9a-f-]+)\)$/.exec(
              expression,
            );
          assert.ok(match);
          assert.equal(match[1], match[2]);
          values.push(match[1], match[3]);
          filters.push(
            `(created_at<$${values.length - 1} OR (created_at=$${values.length - 1} AND id<$${values.length}))`,
          );
          return chain;
        },
        gte(field, value) {
          values.push(value);
          filters.push(`${identifier(field)}>=$${values.length}`);
          return chain;
        },
        lte(field, value) {
          values.push(value);
          filters.push(`${identifier(field)}<=$${values.length}`);
          return chain;
        },
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
  const range = { from: "2026-10-01", to: "2026-10-31" };
  const completeSession = uuid(80),
    pendingSession = uuid(81),
    foreignSession = uuid(82),
    previousSession = uuid(83);
  for (const [id, school_id, status, academic_year_id] of [
    [completeSession, A, "completed", yearA],
    [pendingSession, A, "pending", yearA],
    [foreignSession, B, "completed", yearA],
    [previousSession, A, "completed", yearB],
  ])
    await insert("siga_attendance_sessions", {
      id,
      school_id,
      status,
      academic_year_id,
      class_group_id: groupA,
      subject_id: subjectA,
      teacher_id: teacher,
      lesson_date: "2026-10-06",
      starts_at: null,
      ends_at: null,
    });
  for (const [id, session_id, student_id, status, school_id] of [
    [uuid(84), completeSession, student, "absent", A],
    [uuid(85), completeSession, peer, "present", A],
    [uuid(86), pendingSession, student, "present", A],
    [uuid(87), completeSession, student, "present", B],
  ])
    await insert("siga_attendance_records", { id, session_id, student_id, status, school_id });
  for (const [id, teacher_id, school_id, status, deleted_at] of [
    [uuid(88), teacher, A, "confirmed", null],
    [uuid(89), otherTeacher, A, "confirmed", null],
    [uuid(90), teacher, B, "confirmed", null],
    [uuid(91), teacher, A, "rejected", null],
    [uuid(92), teacher, A, "confirmed", "2026-10-01T00:00:00Z"],
  ])
    await insert("hr_teacher_lesson_occurrences", {
      id,
      teacher_id,
      school_id,
      status,
      deleted_at,
      class_subject_id: csA,
      lesson_date: "2026-10-06",
      scheduled_starts_at: "07:00:00",
      scheduled_ends_at: "08:00:00",
    });
  const pupilScope = await resolveMobileAcademicScope(db, studentUser, A, "aluno");
  const pupilAttendance = await readMobileAttendance(db, pupilScope, studentData, range);
  check(
    pupilAttendance.sessions.length === 2,
    "foreign school and previous year sessions excluded",
  );
  check(
    pupilAttendance.sessions.find((s) => s.id === completeSession).records.length === 1 &&
      pupilAttendance.sessions.find((s) => s.id === completeSession).records[0].status === "absent",
    "own absent mark, no peer or cross-school mark",
  );
  check(
    !pupilAttendance.sessions.find((s) => s.id === pendingSession).records.length,
    "pending calls do not publish marks",
  );
  check(pupilAttendance.teacherLessons.length === 0, "pupils never read teacher HR occurrences");
  check(
    !JSON.stringify(pupilAttendance).includes(peer),
    "no peer identifiers in attendance projection",
  );
  check(
    parseAcademicAttendance(
      pupilAttendance,
      { userId: studentUser, schoolId: A, role: "aluno" },
      studentData,
      range,
    ).sessions.length === 2,
    "pupil SQL attendance matches strict browser contract",
  );
  const teacherScope = await resolveMobileAcademicScope(db, teacherUser, A, "professor");
  const teacherAttendance = await readMobileAttendance(db, teacherScope, teacherData, range);
  check(
    teacherAttendance.sessions.find((s) => s.id === completeSession).records.length === 2,
    "assigned teacher sees scoped call roster",
  );
  check(
    teacherAttendance.teacherLessons.length === 2 &&
      teacherAttendance.teacherLessons.some((l) => l.status === "rejected"),
    "own HR statuses preserved; unrelated, deleted and foreign occurrences excluded",
  );
  check(
    parseAcademicAttendance(
      teacherAttendance,
      { userId: teacherUser, schoolId: A, role: "professor" },
      teacherData,
      range,
    ).teacherLessons[0].startsAt === "07:00:00",
    "real SQL time encoding passes contract",
  );
  await assert.rejects(
    readMobileAttendance(
      adapter({ cap: "siga_attendance_records" }),
      pupilScope,
      studentData,
      range,
    ),
    (e) => e.code === "ATTENDANCE_UNAVAILABLE",
  );
  checks++;
  await assert.rejects(
    readMobileAttendance(
      adapter({ fail: "hr_teacher_lesson_occurrences" }),
      teacherScope,
      teacherData,
      range,
    ),
    (e) => e.code === "ATTENDANCE_UNAVAILABLE",
  );
  checks++;
  check(
    calls.every((c) => c.filters.some((f) => f.startsWith('"school_id"='))),
    "new attendance queries also repeat school filters",
  );

  for (const [n, status, school, group, year] of [
    [200, "published", A, groupA, yearA],
    [201, "draft", A, groupA, yearA],
    [202, "homologated", A, groupA, yearA],
    [203, "published", B, groupB, yearB],
    [204, "published", A, groupA, yearB],
    [205, "closed", A, groupA, yearA],
    [206, "contested", A, groupA, yearA],
    [207, "rectified", A, groupA, yearA],
  ]) {
    await insert("grade_sheets", {
      id: uuid(n),
      school_id: school,
      class_group_id: group,
      academic_year_id: year,
      title: `Pauta ${n}`,
      kind: "term",
      status,
      published_at: "2026-10-01T12:00:00Z",
    });
    await insert("grade_sheet_rows", {
      id: uuid(n + 100),
      school_id: school,
      grade_sheet_id: uuid(n),
      enrollment_id: school === A ? enrollment : foreignEnrollment,
      continuous_average: 0,
      exam_average: null,
      term_average: 12.5,
      result: "pass",
      observation: "PRIVATE OBSERVATION",
      subject_breakdown: JSON.stringify([{ private: "PRIVATE BREAKDOWN" }]),
    });
  }
  await insert("grade_sheet_rows", {
    id: uuid(400),
    school_id: A,
    grade_sheet_id: uuid(200),
    enrollment_id: peerEnrollment,
    continuous_average: 19,
    exam_average: 18,
    term_average: 19,
    result: "pass",
    observation: "PRIVATE PEER",
    subject_breakdown: "[]",
  });
  const ownResults = await readMobileResults(db, pupilScope, studentData, studentUser);
  check(
    ownResults.sheets.length === 1 && ownResults.sheets[0].id === uuid(200),
    "only current published own-year results, no drafts/homologated/closed/contested/rectified/foreign sheets",
  );
  check(ownResults.sheets[0].enrollmentId === enrollment, "only own enrollment, peer excluded");
  check(
    ownResults.sheets[0].continuousAverage === 0 &&
      ownResults.sheets[0].examAverage === null &&
      ownResults.sheets[0].termAverage === 12.5,
    "actual numeric zero, null and decimal preserved",
  );
  check(
    !JSON.stringify(ownResults).includes("PRIVATE") &&
      !JSON.stringify(ownResults).includes(peerEnrollment),
    "no private observations, subject breakdown or peer identifiers",
  );
  await assert.rejects(
    readMobileResults(db, teacherScope, teacherData, teacherUser),
    (e) => e.code === "RESULTS_STUDENT_ONLY",
  );
  checks++;
  for (const table of ["grade_sheets", "grade_sheet_rows"]) {
    await assert.rejects(
      readMobileResults(adapter({ fail: table }), pupilScope, studentData, studentUser),
      (e) => e.code === "RESULTS_UNAVAILABLE",
    );
    checks++;
    await assert.rejects(
      readMobileResults(adapter({ cap: table }), pupilScope, studentData, studentUser),
      (e) => e.code === "RESULTS_UNAVAILABLE",
    );
    checks++;
  }
  await pg.query("UPDATE grade_sheets SET published_at=null WHERE id=$1", [uuid(200)]);
  await assert.rejects(
    readMobileResults(db, pupilScope, studentData, studentUser),
    (e) => e.code === "RESULTS_INCONSISTENT",
  );
  checks++;
  await pg.query(
    "UPDATE grade_sheets SET published_at='2026-10-01T12:00:00Z',status='draft' WHERE id=$1",
    [uuid(200)],
  );
  check(
    (await readMobileResults(db, pupilScope, studentData, studentUser)).sheets.length === 0,
    "withdrawn publication disappears",
  );

  await insert("terms", {
    id: uuid(450),
    school_id: A,
    academic_year_id: yearA,
    name: "Período configurado",
    sequence: 1,
  });
  for (const [n, school, cs, group, year] of [
    [451, A, csA, groupA, yearA],
    [452, A, unrelatedCs, unrelatedGroup, yearA],
    [453, B, csB, groupB, yearB],
    [454, A, csA, groupA, yearB],
  ]) {
    await insert("gradebooks", {
      id: uuid(n),
      school_id: school,
      class_subject_id: cs,
      class_group_id: group,
      academic_year_id: year,
      term_id: uuid(450),
      status: "open",
    });
    await insert("grade_items", {
      id: uuid(n + 10),
      school_id: school,
      gradebook_id: uuid(n),
      code: "MAC",
      name: "Componente real",
      kind: "continuous",
      max_score: 100,
      sequence: 1,
      assessed_on: null,
    });
    await insert("grade_scores", {
      id: uuid(n + 20),
      school_id: school,
      grade_item_id: uuid(n + 10),
      enrollment_id: school === A ? enrollment : foreignEnrollment,
      score: 0,
      status: "draft",
      note: "PRIVATE NOTE",
      pending_score: 50,
    });
  }
  await insert("grade_scores", {
    id: uuid(480),
    school_id: A,
    grade_item_id: uuid(461),
    enrollment_id: peerEnrollment,
    score: 87.5,
    status: "locked",
    note: "PRIVATE PEER",
    pending_score: null,
  });
  const journals = await readMobileGradebooks(db, teacherScope, teacherData, teacherUser);
  check(
    journals.books.length === 1 && journals.books[0].id === uuid(451),
    "only assigned teacher's current-year diaries, no unrelated teacher/foreign school/previous year",
  );
  check(
    journals.books[0].items[0].scores.length === 2 && journals.books[0].items[0].maxScore === 100,
    "own active roster and actual scale",
  );
  check(
    journals.books[0].items[0].scores.some((s) => s.value === 0 && s.status === "draft") &&
      journals.books[0].items[0].scores.some((s) => s.value === 87.5 && s.status === "locked"),
    "zero, decimal, draft and locked values preserved without inferring publication",
  );
  check(
    !JSON.stringify(journals).includes("PRIVATE") &&
      !JSON.stringify(journals).includes("pending_score"),
    "no private score notes or pending changes",
  );
  await assert.rejects(
    readMobileGradebooks(db, pupilScope, studentData, studentUser),
    (e) => e.code === "GRADEBOOKS_TEACHER_ONLY",
  );
  checks++;
  for (const table of ["gradebooks", "terms", "grade_items", "grade_scores"]) {
    for (const mode of ["fail", "cap"]) {
      await assert.rejects(
        readMobileGradebooks(adapter({ [mode]: table }), teacherScope, teacherData, teacherUser),
        (e) => e.code === "GRADEBOOKS_UNAVAILABLE",
      );
      checks++;
    }
  }
  await pg.query("UPDATE terms SET academic_year_id=$1 WHERE id=$2", [yearB, uuid(450)]);
  await assert.rejects(
    readMobileGradebooks(db, teacherScope, teacherData, teacherUser),
    (e) => e.code === "GRADEBOOKS_INCONSISTENT",
  );
  checks++;
  await pg.query("UPDATE terms SET academic_year_id=$1 WHERE id=$2", [yearA, uuid(450)]);

  await insert("enrollments", {
    id: uuid(600),
    school_id: A,
    academic_year_id: yearA,
    class_group_id: groupA,
    student_id: student,
    status: "closed",
  });
  await insert("fee_items", { id: uuid(601), school_id: A, name: "Propina registada" });
  for (const [n, school, enr] of [
    [602, A, enrollment],
    [603, A, peerEnrollment],
    [604, B, foreignEnrollment],
    [605, A, uuid(600)],
  ]) {
    await insert("finance_contracts", {
      id: uuid(n),
      school_id: school,
      enrollment_id: enr,
      status: "active",
    });
    await insert("finance_invoices", {
      id: uuid(n + 10),
      school_id: school,
      contract_id: uuid(n),
      fee_item_id: uuid(601),
      invoice_number: `FT-${n}`,
      competence_month: "2026-10-01",
      due_date: "2026-10-31",
      status: n === 605 ? "paid" : "partially_paid",
      amount: 100,
      discount_amount: 10,
      penalty_amount: 5,
    });
    await insert("finance_receipts", {
      id: uuid(n + 20),
      school_id: school,
      invoice_id: uuid(n + 10),
      receipt_number: `RC-${n}`,
      amount: 50,
      paid_on: "2026-10-10",
      payment_method: "cash",
      status: "issued",
    });
  }
  await insert("finance_receipts", {
    id: uuid(630),
    school_id: A,
    invoice_id: uuid(612),
    receipt_number: "RC-reversed",
    amount: 10,
    paid_on: "2026-10-09",
    payment_method: "bank_transfer",
    status: "reversed",
  });
  const finance = await readMobileFinance(db, pupilScope, studentUser);
  check(
    finance.invoices.length === 2 && finance.invoices.some((i) => i.id === uuid(615)),
    "only own current/historical enrollment invoices, no peer/foreign school",
  );
  check(
    finance.invoices.find((i) => i.id === uuid(612)).receipts.length === 2,
    "own receipt history includes explicit reversal without deleting history",
  );
  check(
    finance.invoices[0].amountCents === 10000 &&
      finance.invoices[0].discountCents === 1000 &&
      finance.invoices[0].penaltyCents === 500,
    "safe cent conversion preserves invoice values",
  );
  await assert.rejects(
    readMobileFinance(db, teacherScope, teacherUser),
    (e) => e.code === "FINANCE_STUDENT_ONLY",
  );
  checks++;
  for (const table of [
    "enrollments",
    "finance_contracts",
    "finance_invoices",
    "fee_items",
    "finance_receipts",
  ])
    for (const mode of ["fail", "cap"]) {
      await assert.rejects(
        readMobileFinance(adapter({ [mode]: table }), pupilScope, studentUser),
        (e) => e.code === "FINANCE_UNAVAILABLE",
      );
      checks++;
    }
  const direct = uuid(700),
    foreignChat = uuid(701),
    hiddenChat = uuid(702);
  for (const [id, school_id] of [
    [direct, A],
    [foreignChat, B],
    [hiddenChat, A],
  ])
    await insert("siga_chat_conversations", { id, school_id, type: "direct", title: null });
  for (const [id, user_id] of [
    [direct, studentUser],
    [direct, teacherUser],
    [foreignChat, studentUser],
    [foreignChat, peerUser],
    [hiddenChat, peerUser],
  ])
    await insert("siga_chat_members", {
      conversation_id: id,
      user_id,
      last_read_at: "2026-10-09T00:00:00Z",
    });
  for (const [id, full_name] of [
    [studentUser, "Aluno"],
    [teacherUser, "Professor real"],
  ])
    await insert("profiles", { id, full_name });
  await insert("school_memberships", {
    id: uuid(703),
    school_id: A,
    user_id: teacherUser,
    status: "active",
  });
  for (let n = 0; n < 65; n++)
    await insert("siga_chat_messages", {
      id: uuid(710 + n),
      school_id: A,
      conversation_id: direct,
      sender_id: teacherUser,
      body: `Mensagem ${n}`,
      created_at: `2026-10-10T08:00:00.123${String(n).padStart(3, "0")}Z`,
      deleted_at: n === 64 ? "2026-10-10T09:00:00Z" : null,
      reply_to: n === 63 ? uuid(710) : null,
      attachment_file_id: n === 64 ? uuid(900) : null,
      attachment_file_name: n === 64 ? "Segredo apagado" : null,
    });
  await insert("siga_chat_messages", {
    id: uuid(800),
    school_id: B,
    conversation_id: direct,
    sender_id: teacherUser,
    body: "Outra escola",
    created_at: "2026-10-10T08:00:00Z",
  });
  const inbox = await readMobileChat(db, pupilScope, studentUser);
  check(
    inbox.threads.length === 1 &&
      inbox.threads[0].unread === 64 &&
      inbox.threads[0].name === "Professor real",
    "inbox counts only nondeleted school messages and owned threads",
  );
  const first = await readMobileChat(db, pupilScope, studentUser, direct);
  check(
    first.messages.length === 60 && first.next.id === uuid(715),
    "stable 60-message page at equal timestamps",
  );
  check(
    first.messages.at(-1).deleted &&
      !first.messages.at(-1).body &&
      !first.messages.at(-1).attachment,
    "deleted bodies and attachments redacted",
  );
  check(
    first.messages.find((m) => m.id === uuid(773)).reply.body === "Mensagem 0",
    "reply parent resolved only in same conversation and school",
  );
  const second = await readMobileChat(db, pupilScope, studentUser, direct, first.next);
  check(
    second.messages.length === 5 && !second.next && second.messages.at(-1).id === uuid(714),
    "keyset pagination no skipped or duplicated PostgreSQL microseconds inside the same millisecond",
  );
  for (const id of [foreignChat, hiddenChat]) {
    await assert.rejects(
      readMobileChat(db, pupilScope, studentUser, id),
      (e) => e.code === "CHAT_FORBIDDEN",
    );
    checks++;
  }
  for (const table of [
    "siga_chat_members",
    "siga_chat_conversations",
    "siga_chat_messages",
    "profiles",
    "school_memberships",
  ]) {
    await assert.rejects(
      readMobileChat(adapter({ fail: table }), pupilScope, studentUser),
      (e) => e.code === "CHAT_UNAVAILABLE",
    );
    checks++;
  }
  await pg.query("UPDATE school_memberships SET status='inactive' WHERE id=$1", [uuid(703)]);
  check(
    (await readMobileChat(db, pupilScope, studentUser)).threads[0].peerLeft,
    "departed direct peer is flagged without inventing availability",
  );
  await pg.query("UPDATE school_memberships SET status='active' WHERE id=$1", [uuid(703)]);
  await insert("school_memberships", {
    id: uuid(704),
    school_id: A,
    user_id: peerUser,
    status: "active",
  });
  await insert("roles", { id: uuid(705), code: "teacher" });
  await insert("roles", { id: uuid(706), code: "student" });
  await insert("member_roles", { membership_id: uuid(703), role_id: uuid(705) });
  await insert("member_roles", { membership_id: uuid(704), role_id: uuid(706) });
  check(
    (await readMobileChatContacts(db, A, studentUser, ["Aluno"])).length === 1,
    "student contacts include only staff in this school",
  );
  check(
    (await readMobileChatContacts(db, A, teacherUser, ["Professor"])).some(
      (c) => c.id === peerUser,
    ),
    "teacher contacts include active school students",
  );
  await insert("siga_files", {
    id: uuid(900),
    school_id: A,
    name: "Enunciado.pdf",
    area: "escola",
    visibility: "school",
    owner_user_id: teacherUser,
    related_user_id: null,
    is_folder: false,
    is_system: false,
    storage_backend: "sga",
    storage_path: "school/enunciado.pdf",
    deleted_at: null,
  });
  await pg.query(
    "UPDATE siga_chat_messages SET attachment_file_id=$1,attachment_file_name='Enunciado.pdf' WHERE id=$2",
    [uuid(900), uuid(772)],
  );
  const signedPaths = [];
  const fileDb = {
    ...db,
    storage: {
      from(bucket) {
        assert.equal(bucket, "siga-files");
        return {
          async createSignedUrl(path, seconds) {
            signedPaths.push(path);
            assert.equal(seconds, 600);
            return {
              data: {
                signedUrl:
                  "https://xodgfmxiaunpamctfeea.supabase.co/storage/v1/object/sign/siga-files/school/enunciado.pdf?token=test",
              },
              error: null,
            };
          },
        };
      },
    },
  };
  check(
    !!(await signMobileChatAttachment(fileDb, A, studentUser, uuid(772))).url,
    "actual message/tenant/member/sender file permissions checked before storage signing",
  );
  await assert.rejects(
    signMobileChatAttachment(fileDb, A, peerUser, uuid(772)),
    (e) => e.code === "CHAT_FORBIDDEN",
  );
  checks++;
  await assert.rejects(
    signMobileChatAttachment(fileDb, B, studentUser, uuid(772)),
    (e) => e.code === "ATTACHMENT_NOT_FOUND",
  );
  checks++;
  await pg.query("UPDATE siga_files SET visibility='private',owner_user_id=$1 WHERE id=$2", [
    peerUser,
    uuid(900),
  ]);
  await assert.rejects(
    signMobileChatAttachment(fileDb, A, studentUser, uuid(772)),
    (e) => e.code === "ATTACHMENT_FORBIDDEN",
  );
  checks++;
  check(signedPaths.length === 1, "forbidden attachments never reach storage signer");
  await pg.query("UPDATE siga_files SET visibility='school',owner_user_id=$1 WHERE id=$2", [
    teacherUser,
    uuid(900),
  ]);
  await pg.query("UPDATE school_memberships SET status='inactive' WHERE id=$1", [uuid(703)]);
  await assert.rejects(
    signMobileChatAttachment(fileDb, A, studentUser, uuid(772)),
    (e) => e.code === "ATTACHMENT_FORBIDDEN",
  );
  checks++;
  await pg.query("DELETE FROM siga_chat_members WHERE conversation_id=$1 AND user_id=$2", [
    direct,
    studentUser,
  ]);
  await assert.rejects(
    readMobileChat(db, pupilScope, studentUser, direct),
    (e) => e.code === "CHAT_FORBIDDEN",
  );
  checks++;
  const noRows = await readMobileAttendance(db, pupilScope, studentData, {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  check(!noRows.sessions.length, "no synthetic lessons derived from timetable");
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
  // Notification fixtures: actual reader and count query against local PostgreSQL.
  const notification = (id, school_id, user_id, extras = {}) =>
    insert("notifications", {
      id: uuid(id),
      school_id,
      user_id,
      channel: "in_app",
      event_type: "schedule",
      title: "Aviso de ensaio SQL",
      body: "Texto controlado",
      status: "sent",
      read_at: null,
      created_at: "2026-10-10T08:00:00Z",
      ...extras,
    });
  for (let n = 900; n < 960; n++) await notification(n, A, studentUser);
  await notification(960, A, studentUser, { status: "read" });
  await notification(961, A, studentUser, { read_at: "2026-10-10T08:10:00Z" });
  await notification(962, A, studentUser, { channel: "email" });
  await notification(963, B, studentUser);
  await notification(964, A, peerUser);
  await notification(965, A, teacherUser);
  const notices = await readMobileNotifications(db, {
    schoolId: A,
    userId: studentUser,
    role: "aluno",
  });
  check(notices.items.length === 50, "notification recent list capped at 50");
  check(
    notices.unread === 60,
    "unread count includes older own in-app notices, excludes read status/read timestamp",
  );
  check(
    notices.items[0].id === uuid(961) && notices.items[1].id === uuid(960),
    "equal-time notices have deterministic UUID ordering",
  );
  check(notices.items[0].read && notices.items[1].read, "both canonical read markers recognized");
  check(
    (await readMobileNotifications(db, { schoolId: B, userId: studentUser, role: "aluno" })).items
      .length === 1,
    "same notification account in another school remains isolated",
  );
  check(
    (await readMobileNotifications(db, { schoolId: A, userId: teacherUser, role: "professor" }))
      .items.length === 1,
    "teacher only sees own notifications",
  );
  // Página seguinte: os 12 mais antigos, sem repetir nem saltar avisos com a
  // mesma data (ordem por data e id, como na primeira página).
  const studentNotices = { schoolId: A, userId: studentUser, role: "aluno" };
  check(notices.next?.id === notices.items[49].id, "full page exposes cursor at its last item");
  const older = await readMobileNotifications(db, studentNotices, notices.next);
  const seen = new Set(notices.items.map((x) => x.id));
  check(
    older.items.length === 12 && older.items.every((x) => !seen.has(x.id)) && older.next === null,
    "second page holds the remaining own notices with no overlap and no further cursor",
  );
  // Marcar como lido: só os próprios, da escola, do canal in_app, ainda por ler.
  const firstTwo = [notices.items[2].id, notices.items[3].id];
  const receipt = await markMobileNotificationsRead(db, studentNotices, { ids: firstTwo });
  check(
    receipt.updated === 2 && receipt.unread === 58,
    "marking two own notices lowers the counter",
  );
  const readAt = await pg.query(
    "SELECT status, read_at FROM notifications WHERE id = ANY($1::uuid[]) ORDER BY id",
    [firstTwo],
  );
  check(
    readAt.rows.every((r) => r.status === "read" && r.read_at),
    "marked notices get the same status and read_at the web app writes",
  );
  const again = await markMobileNotificationsRead(db, studentNotices, { ids: firstTwo });
  const kept = await pg.query("SELECT read_at FROM notifications WHERE id = $1", [firstTwo[0]]);
  check(
    again.updated === 0 && kept.rows[0].read_at.getTime() === readAt.rows[0].read_at.getTime(),
    "repeating the request changes nothing and keeps the first read time",
  );
  const foreign = await markMobileNotificationsRead(db, studentNotices, {
    ids: [uuid(963), uuid(964), uuid(965), uuid(962)],
  });
  const untouched = await pg.query(
    "SELECT count(*)::int AS n FROM notifications WHERE id = ANY($1::uuid[]) AND read_at IS NULL",
    [[uuid(963), uuid(964), uuid(965), uuid(962)]],
  );
  check(
    foreign.updated === 0 && untouched.rows[0].n === 4,
    "another school, other users and other channels are never marked",
  );
  const all = await markMobileNotificationsRead(db, studentNotices, { all: true });
  check(all.updated === 58 && all.unread === 0, "mark all clears this school only");
  check(
    (await readMobileNotifications(db, { schoolId: B, userId: studentUser, role: "aluno" }))
      .unread === 1,
    "the same account keeps its unread notice in the other school",
  );
  await assert.rejects(
    markMobileNotificationsRead(adapter({ fail: "notifications" }), studentNotices, { all: true }),
    (e) => e.code === "NOTIFICATIONS_UNAVAILABLE",
  );
  checks++;
  await assert.rejects(
    readMobileNotifications(adapter({ fail: "notifications" }), {
      schoolId: A,
      userId: studentUser,
      role: "aluno",
    }),
    (e) => e.code === "NOTIFICATIONS_UNAVAILABLE",
  );
  checks++;
  console.log(
    `Mobile V4 academic catalog: ${checks} local PostgreSQL checks passed (no production access).`,
  );
} finally {
  await pg.close();
}
