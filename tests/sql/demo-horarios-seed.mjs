// Ensaio local (PGlite) de supabase/SEED_DEMO_HORARIOS_2026.sql e do PURGE. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/demo-horarios-seed.mjs
//
// Esquema: fixtures/demo-horarios-schema.sql (34 tabelas captadas da produção por
// scripts/siga/capture-table-ddl.mjs: tipos, omissões, CHECK, UNIQUE e chaves) e
// fixtures/demo-horarios-guards.sql (gatilhos de conflito de horário e de datas dos
// eventos, lidos com pg_get_functiondef). A publicação é a migração real 20261025121012.
// Os gatilhos de âmbito e de auditoria ficam de fora: no SQL Editor (role postgres, sem
// auth.uid() nem service_role) deixam passar, e é aí que o seed corre.
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("./fixtures/demo-horarios-schema.sql");
const guards = read("./fixtures/demo-horarios-guards.sql");
const publication = read(
  "../../supabase/migrations/20261025121012_atomic_academic_schedule_publication.sql",
);
const seed = read("../../supabase/SEED_DEMO_HORARIOS_2026.sql");
const purge = read("../../supabase/PURGE_DEMO_HORARIOS_2026.sql");
const dryRun = seed.replace(
  "c_dry_run constant boolean := false;",
  "c_dry_run constant boolean := true;",
);
assert.notEqual(dryRun, seed);

const db = new PGlite();
const declared = new Set(
  [...schema.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1]),
);
const referenced = new Set(
  [...schema.matchAll(/REFERENCES (?:public\.)?(\w+)\(/g)]
    .map((m) => m[1])
    .filter((t) => !declared.has(t)),
);
referenced.delete("users"); // auth.users
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
${[...referenced].map((t) => `CREATE TABLE public.${t} (id uuid PRIMARY KEY);`).join("\n")}
`);
await db.exec(schema);
await db.exec(guards);
await db.exec(publication);

// O que o seed encontra no Colégio Adventista (ids da produção, dados mínimos).
const school = "08676df5-771a-45bc-af3b-fcbf727e9d5e";
const owner = "33903bae-7ab8-4c2d-8cd5-9458930a5b10";
const fernando = "efa4db4e-e916-4423-882a-37b1e0533020";
const realTeacher = "34a71166-120d-49b3-bc1b-f7c29d6bf9d9";
const year = "b2b0457d-b9c7-43f3-b4bd-b51b6e960b80";
const subjects = [
  "MAT",
  "PORT",
  "FIS",
  "QUI",
  "BIO",
  "ING",
  "FILOS",
  "TIC",
  "EF",
  "EMPR",
  "HIST",
  "GEO",
];
await db.exec(`
INSERT INTO auth.users VALUES ('${owner}', 'valentinocanguele@gmail.com'), ('${fernando}', 'fernandotunas6@gmail.com');
INSERT INTO public.schools (id, public_code, name) VALUES ('${school}', 'SIGA-AO-000001', 'Colegio Adventista - Huambo');
INSERT INTO public.school_memberships (school_id, user_id, status) VALUES ('${school}', '${owner}', 'active'), ('${school}', '${fernando}', 'active');
INSERT INTO public.academic_years (id, school_id, name, starts_on, ends_on, status) VALUES ('${year}', '${school}', '2026/2027', '2026-09-01', '2027-07-31', 'active');
INSERT INTO public.terms (school_id, academic_year_id, name, sequence, starts_on, ends_on) VALUES
  ('${school}', '${year}', '1.º Trimestre', 1, '2026-09-01', '2026-12-20'),
  ('${school}', '${year}', '2.º Trimestre', 2, '2026-12-21', '2027-04-10'),
  ('${school}', '${year}', '3.º Trimestre', 3, '2027-04-11', '2027-07-31');
INSERT INTO public.campuses (school_id, code, name) SELECT '${school}', 'BONGO', 'Bongo'
  WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campuses' AND column_name = 'code');
INSERT INTO public.school_shifts (school_id, code, name, starts_at, ends_at) VALUES
  ('${school}', 'morning', 'Manhã', '07:00', '12:30'), ('${school}', 'afternoon', 'Tarde', '13:00', '18:00');
INSERT INTO public.academic_levels (id, school_id, code, name, sequence) VALUES ('00000000-0000-0000-0000-00000000a001', '${school}', 'SEC', 'Secundário', 3);
INSERT INTO public.programs (id, school_id, academic_level_id, code, name) VALUES
  ('00000000-0000-0000-0000-00000000b001', '${school}', '00000000-0000-0000-0000-00000000a001', 'ESG1', 'I Ciclo'),
  ('00000000-0000-0000-0000-00000000b002', '${school}', '00000000-0000-0000-0000-00000000a001', 'ESG2-CFB', 'Ciências Físicas e Biológicas');
INSERT INTO public.grade_levels (school_id, program_id, code, name, sequence) VALUES
  ('${school}', '00000000-0000-0000-0000-00000000b001', '7CL', '7ª Classe', 7),
  ('${school}', '00000000-0000-0000-0000-00000000b002', '10CL', '10ª Classe · CFB', 10);
INSERT INTO public.subjects (school_id, code, name, created_by, updated_by)
  SELECT '${school}', c, c, '${owner}', '${owner}' FROM unnest(ARRAY[${subjects.map((s) => `'${s}'`).join(",")}]) c;
INSERT INTO public.people (id, school_id, full_name, created_by, updated_by) VALUES
  ('00000000-0000-0000-0000-00000000c001', '${school}', 'tunas fernando', '${owner}', '${owner}');
INSERT INTO public.teachers (id, school_id, person_id, employee_number, hired_on, employment_type, highest_qualification, user_id, created_by, updated_by)
  VALUES ('${realTeacher}', '${school}', '00000000-0000-0000-0000-00000000c001', 'DOC-2571350078', '2025-01-01', 'permanent', 'licentiate', '${fernando}', '${owner}', '${owner}');
`);

// Uma turma real com uma aula às 07:00 de segunda na «Sala de demonstração 01»: o seed
// não pode colidir com o horário existente nem tocar-lhe.
await db.exec(`
INSERT INTO public.class_groups (id, school_id, academic_year_id, campus_id, grade_level_id, code, name, shift, capacity, status, created_by, updated_by)
  SELECT '00000000-0000-0000-0000-00000000d001', '${school}', '${year}', (SELECT id FROM public.campuses LIMIT 1),
         (SELECT id FROM public.grade_levels WHERE code = '7CL'), 'REAL-7', 'Turma real', 'morning', 40, 'active', '${owner}', '${owner}';
INSERT INTO public.class_subjects (id, school_id, class_group_id, subject_id, weekly_periods, created_by, updated_by)
  SELECT '00000000-0000-0000-0000-00000000d002', '${school}', '00000000-0000-0000-0000-00000000d001', id, 1, '${owner}', '${owner}' FROM public.subjects WHERE code = 'MAT';
INSERT INTO public.timetable_slots (school_id, class_subject_id, weekday, starts_at, ends_at, room, created_by)
  VALUES ('${school}', '00000000-0000-0000-0000-00000000d002', 1, '07:00', '07:45', 'Sala de demonstração 01', '${owner}');
`);

const count = async (sql) => Number((await db.query(sql)).rows[0].n);
const demoGroups = `(SELECT id FROM public.class_groups WHERE code LIKE 'DH26-%')`;
const snapshot = async () => ({
  rooms: await count(`SELECT count(*) n FROM public.rooms WHERE code LIKE 'DH26-%'`),
  groups: await count(`SELECT count(*) n FROM public.class_groups WHERE code LIKE 'DH26-%'`),
  teachers: await count(
    `SELECT count(DISTINCT teacher_id) n FROM public.class_subjects WHERE class_group_id IN ${demoGroups}`,
  ),
  enrollments: await count(
    `SELECT count(*) n FROM public.enrollments WHERE class_group_id IN ${demoGroups} AND status = 'active'`,
  ),
  classSubjects: await count(
    `SELECT count(*) n FROM public.class_subjects WHERE class_group_id IN ${demoGroups}`,
  ),
  publishedSlots: await count(
    `SELECT count(*) n FROM public.timetable_slots t JOIN public.class_subjects cs ON cs.id = t.class_subject_id WHERE cs.class_group_id IN ${demoGroups} AND t.schedule_id IS NOT NULL`,
  ),
  schedules: await count(
    `SELECT count(*) n FROM public.academic_schedules WHERE class_group_id IN ${demoGroups}`,
  ),
  assessments: await count(
    `SELECT count(*) n FROM public.siga_assessment_items WHERE class_group_id IN ${demoGroups}`,
  ),
  scores: await count(`SELECT count(*) n FROM public.siga_assessment_scores`),
  tasks: await count(`SELECT count(*) n FROM public.siga_class_tasks`),
  submissions: await count(`SELECT count(*) n FROM public.siga_class_task_submissions`),
  events: await count(
    `SELECT count(*) n FROM public.siga_calendar_events WHERE class_group_id IN ${demoGroups}`,
  ),
  schoolWideEvents: await count(
    `SELECT count(*) n FROM public.siga_calendar_events WHERE class_group_id IS NULL`,
  ),
  exams: await count(`SELECT count(*) n FROM public.siga_exam_sessions`),
  people: await count(`SELECT count(*) n FROM public.people`),
});
const empty = await snapshot();

// O ensaio (c_dry_run) termina com erro e não deixa nada.
await assert.rejects(
  db.exec(dryRun),
  /ENSAIO OK \(nada gravado\): salas=6 professores=8 turmas=2 alunos=30/,
);
assert.deepEqual(await snapshot(), empty);

await db.exec(seed);
const full = await snapshot();
assert.deepEqual(
  { ...full, people: full.people - empty.people },
  {
    rooms: 6,
    groups: 2,
    teachers: 8, // 7 fictícios + o professor real em Inglês
    enrollments: 30,
    classSubjects: 19,
    publishedSlots: 55, // 30 (manhã) + 25 (tarde), todos na versão publicada
    schedules: 2,
    assessments: 19 * 7,
    scores: 19 * 15, // Teste 1 (MAC) já lançado
    tasks: 12,
    submissions: 2 * (2 * 12 + 4 * 4),
    events: 14 + 15,
    schoolWideEvents: 0, // nada aparece às turmas reais
    exams: 2,
    people: 8 + 30, // 8 professores fictícios (o de Inglês fica de reserva) + 30 alunos
  },
);

// Cada turma DH26 cumpre a carga semanal e a versão publicada guarda as aulas todas.
const loads = await db.query(`
  SELECT g.code,
         (SELECT sum(cs.weekly_periods) FROM public.class_subjects cs WHERE cs.class_group_id = g.id)::int AS carga,
         (SELECT count(*) FROM public.timetable_slots t JOIN public.class_subjects cs ON cs.id = t.class_subject_id
           WHERE cs.class_group_id = g.id AND t.status = 'active')::int AS aulas,
         (SELECT (s.metrics->>'lessonCount')::int FROM public.academic_schedules s
           WHERE s.class_group_id = g.id AND s.status = 'published') AS publicadas
    FROM public.class_groups g WHERE g.code LIKE 'DH26-%' ORDER BY g.code`);
assert.deepEqual(loads.rows, [
  { code: "DH26-10A", carga: 30, aulas: 30, publicadas: 30 },
  { code: "DH26-7A", carga: 25, aulas: 25, publicadas: 25 },
]);

// Nenhuma sobreposição de turma, professor ou sala em toda a escola.
assert.equal(
  await count(`SELECT count(*) n FROM public.timetable_slots a
    JOIN public.class_subjects ca ON ca.id = a.class_subject_id
    JOIN public.timetable_slots b ON b.id <> a.id AND b.weekday = a.weekday AND b.starts_at < a.ends_at AND a.starts_at < b.ends_at
    JOIN public.class_subjects cb ON cb.id = b.class_subject_id
   WHERE ca.class_group_id = cb.class_group_id OR ca.teacher_id = cb.teacher_id OR lower(a.room) = lower(b.room)`),
  0,
);
// Trabalhos por entregar: prazo futuro com 11 de 15 alunos ainda sem entrega.
assert.equal(
  await count(`SELECT count(*) n FROM public.siga_class_tasks t
    WHERE t.due_on > current_date AND (SELECT count(*) FROM public.siga_class_task_submissions s WHERE s.task_id = t.id) = 4`),
  8,
);

// Repetir não duplica nada nem publica outra versão.
await db.exec(seed);
assert.deepEqual(await snapshot(), full);

// A limpeza apaga tudo o que o seed criou e o que a aplicação gerou por cima; o
// professor real, as disciplinas e a turma real ficam.
await db.exec(`INSERT INTO public.siga_attendance_sessions (school_id, class_group_id, subject_id, timetable_slot_id, lesson_date, status)
  SELECT cs.school_id, cs.class_group_id, cs.subject_id, t.id, current_date, 'pending'
    FROM public.timetable_slots t JOIN public.class_subjects cs ON cs.id = t.class_subject_id
   WHERE cs.class_group_id IN ${demoGroups} LIMIT 3`);
await db.exec(purge);
assert.deepEqual(await snapshot(), empty);
assert.equal(await count(`SELECT count(*) n FROM public.siga_attendance_sessions`), 0);
assert.equal(await count(`SELECT count(*) n FROM public.teachers WHERE id = '${realTeacher}'`), 1);
assert.equal(await count(`SELECT count(*) n FROM public.timetable_slots`), 1);
await db.exec(purge);

// A limpeza recusa turmas DH26 com alunos reais.
await db.exec(seed);
await db.exec(`
INSERT INTO public.people (id, school_id, full_name, created_by, updated_by) VALUES ('00000000-0000-0000-0000-00000000e001', '${school}', 'Aluno real', '${owner}', '${owner}');
INSERT INTO public.students (id, school_id, person_id, student_number, created_by, updated_by) VALUES ('00000000-0000-0000-0000-00000000e002', '${school}', '00000000-0000-0000-0000-00000000e001', '1260001', '${owner}', '${owner}');
INSERT INTO public.enrollments (school_id, academic_year_id, class_group_id, student_id, enrollment_number, enrolled_on, created_by, updated_by)
  SELECT '${school}', '${year}', id, '00000000-0000-0000-0000-00000000e002', '1260001', '2026-09-01', '${owner}', '${owner}' FROM public.class_groups WHERE code = 'DH26-7A';
`);
await assert.rejects(db.exec(purge), /matrículas reais nas turmas DH26/);
assert.equal((await snapshot()).groups, 2);

console.log("demo-horarios-seed: ensaio, seed (2×), limpeza (2×) e recusa da limpeza — OK");
