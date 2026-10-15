// Ensaio local (PGlite) de 20261010150000_merge_school_subjects.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/merge-school-subjects.mjs
//
// As tabelas levam só as colunas que a função usa e as restrições de unicidade
// capturadas no repositório. Restrições da produção que o repositório não conhece
// fazem a função falhar e desfazer tudo — o ensaio do «desfaz tudo» está no fim.
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261010150000_merge_school_subjects.sql", import.meta.url),
  "utf8",
);

const db = new PGlite();
await db.exec(`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public, private, auth TO authenticated, anon;
-- Sessão simulada: quem é, se tem 2FA, que permissões tem.
CREATE TABLE private.fake_session (uid uuid, aal2 boolean, can_manage boolean);
INSERT INTO private.fake_session VALUES ('00000000-0000-0000-0000-0000000000aa', true, true);
GRANT SELECT ON private.fake_session TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT uid FROM private.fake_session $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT aal2 FROM private.fake_session $$;
CREATE FUNCTION private.has_permission(s uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT can_manage AND s = '00000000-0000-0000-0000-000000000001' FROM private.fake_session $$;

CREATE TABLE public.subjects (id uuid PRIMARY KEY, school_id uuid NOT NULL, name text, status text DEFAULT 'active',
  updated_by uuid, deleted_at timestamptz);
CREATE TABLE public.class_groups (id uuid PRIMARY KEY, school_id uuid, name text);
CREATE TABLE public.class_subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, class_group_id uuid,
  subject_id uuid, updated_by uuid, created_at timestamptz DEFAULT now(),
  UNIQUE (school_id, class_group_id, subject_id));
CREATE TABLE public.curriculum_subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, curriculum_id uuid,
  subject_id uuid, updated_by uuid, deleted_at timestamptz, created_at timestamptz DEFAULT now(),
  UNIQUE (curriculum_id, subject_id));
CREATE TABLE public.teacher_subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, teacher_id uuid,
  subject_id uuid, valid_from date, valid_until date, created_at timestamptz DEFAULT now(),
  UNIQUE (school_id, teacher_id, subject_id, valid_from));
CREATE UNIQUE INDEX teacher_subjects_active_uidx ON public.teacher_subjects (school_id, teacher_id, subject_id) WHERE valid_until IS NULL;
CREATE TABLE public.assessment_key_subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, rule_set_id uuid,
  subject_id uuid, created_at timestamptz DEFAULT now(), UNIQUE (school_id, rule_set_id, subject_id));
CREATE TABLE public.program_subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, subject_id uuid);
CREATE TABLE public.siga_assessment_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, subject_id uuid, closed boolean DEFAULT false);
-- Como o gatilho de período fechado da produção: recusa mexer em avaliações fechadas.
CREATE FUNCTION public.block_closed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.closed THEN RAISE EXCEPTION 'Período fechado.'; END IF; RETURN NEW; END $$;
CREATE TRIGGER block_closed BEFORE UPDATE ON public.siga_assessment_items FOR EACH ROW EXECUTE FUNCTION public.block_closed();
CREATE TABLE public.siga_attendance_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, subject_id uuid);
CREATE TABLE public.siga_competencies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, subject_id uuid,
  grade_level_id uuid, code text);
CREATE UNIQUE INDEX siga_competencies_code_key ON public.siga_competencies
  (school_id, subject_id, coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE TABLE public.siga_exam_registrations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, subject_id uuid,
  session_id uuid, enrollment_id uuid, UNIQUE (session_id, enrollment_id, subject_id));
CREATE TABLE public.siga_lesson_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid, subject_id uuid);
`);

await db.exec(migration);
await db.exec(migration);

const S = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";
const KEEP = "10000000-0000-0000-0000-000000000001"; // Matemática
const DUP = "10000000-0000-0000-0000-000000000002"; // Matematica
const DUP2 = "10000000-0000-0000-0000-000000000003"; // MAT
const FOREIGN = "10000000-0000-0000-0000-000000000009"; // outra escola
const T1 = "20000000-0000-0000-0000-000000000001";
const T2 = "20000000-0000-0000-0000-000000000002";
const CUR = "30000000-0000-0000-0000-000000000001";
const PROF = "40000000-0000-0000-0000-000000000001";

async function seed() {
  await db.exec(`
  TRUNCATE public.subjects, public.class_groups, public.class_subjects, public.curriculum_subjects,
    public.teacher_subjects, public.assessment_key_subjects, public.program_subjects, public.siga_assessment_items,
    public.siga_attendance_sessions, public.siga_competencies, public.siga_exam_registrations, public.siga_lesson_plans;
  UPDATE private.fake_session SET aal2 = true, can_manage = true;
  INSERT INTO public.subjects (id, school_id, name) VALUES
    ('${KEEP}', '${S}', 'Matemática'), ('${DUP}', '${S}', 'Matematica'), ('${DUP2}', '${S}', 'MAT'),
    ('${FOREIGN}', '${OTHER}', 'Matemática');
  INSERT INTO public.class_groups VALUES ('${T1}', '${S}', '7ª A'), ('${T2}', '${S}', '7ª B');
  -- Turma A com a «Matemática», turma B com a «Matematica».
  INSERT INTO public.class_subjects (school_id, class_group_id, subject_id) VALUES
    ('${S}', '${T1}', '${KEEP}'), ('${S}', '${T2}', '${DUP}');
  -- O mesmo currículo com as duas: fica uma ligação.
  INSERT INTO public.curriculum_subjects (school_id, curriculum_id, subject_id) VALUES
    ('${S}', '${CUR}', '${KEEP}'), ('${S}', '${CUR}', '${DUP}');
  -- O mesmo professor atribuído às duas, em vigor.
  INSERT INTO public.teacher_subjects (school_id, teacher_id, subject_id, valid_from) VALUES
    ('${S}', '${PROF}', '${KEEP}', '2026-01-01'), ('${S}', '${PROF}', '${DUP}', '2026-02-01');
  INSERT INTO public.siga_assessment_items (school_id, subject_id) VALUES ('${S}', '${DUP}'), ('${S}', '${DUP2}');
  INSERT INTO public.siga_attendance_sessions (school_id, subject_id) VALUES ('${S}', '${DUP}');
  INSERT INTO public.siga_lesson_plans (school_id, subject_id) VALUES ('${S}', '${DUP2}');
  INSERT INTO public.siga_competencies (school_id, subject_id, code) VALUES ('${S}', '${KEEP}', 'C1'), ('${S}', '${DUP}', 'C2');
  `);
}

const merge = (keep, ids, school = S) =>
  db.query("SELECT public.merge_school_subjects($1, $2, $3::uuid[]) AS r", [school, keep, ids]);
const asUser = async (fn) => {
  await db.exec("SET ROLE authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
};
const count = async (sql) => Number((await db.query(sql)).rows[0].n);

// 1. Caminho feliz.
await seed();
const { rows } = await asUser(() => merge(KEEP, [DUP, DUP2]));
const r = rows[0].r;
assert.equal(r.merged, 2);
assert.equal(r.class_subjects, 1);
assert.equal(r.siga_assessment_items, 2);
assert.equal(
  await count(`SELECT count(*) n FROM public.class_subjects WHERE subject_id = '${KEEP}'`),
  2,
);
assert.equal(
  await count(`SELECT count(*) n FROM public.curriculum_subjects WHERE curriculum_id = '${CUR}'`),
  1,
);
assert.equal(
  await count(`SELECT count(*) n FROM public.teacher_subjects WHERE teacher_id = '${PROF}'`),
  1,
);
assert.equal(
  (await db.query(`SELECT subject_id FROM public.teacher_subjects`)).rows[0].subject_id,
  KEEP,
  "fica a atribuição da disciplina a manter",
);
for (const t of [
  "siga_assessment_items",
  "siga_attendance_sessions",
  "siga_lesson_plans",
  "siga_competencies",
]) {
  assert.equal(
    await count(`SELECT count(*) n FROM public.${t} WHERE subject_id <> '${KEEP}'`),
    0,
    t,
  );
}
const statuses = (await db.query(`SELECT id, status, updated_by FROM public.subjects ORDER BY id`))
  .rows;
assert.deepEqual(
  statuses.map((s) => s.status),
  ["active", "inactive", "inactive", "active"],
  "as juntas ficam inactivas, não apagadas; a outra escola não muda",
);
assert.equal(statuses[1].updated_by, "00000000-0000-0000-0000-0000000000aa");

// 2. Recusas, sem mexer em nada.
const refuses = async (label, setup, re, args = [KEEP, [DUP]]) => {
  await seed();
  if (setup) await db.exec(setup);
  const before = (
    await db.query("SELECT subject_id::text s FROM public.class_subjects ORDER BY id")
  ).rows;
  await assert.rejects(
    asUser(() => merge(...args)),
    re,
    label,
  );
  const after = (await db.query("SELECT subject_id::text s FROM public.class_subjects ORDER BY id"))
    .rows;
  assert.deepEqual(after, before, `${label}: nada mudou`);
  assert.equal(
    await count(`SELECT count(*) n FROM public.subjects WHERE status = 'inactive'`),
    0,
    label,
  );
};
await refuses("sem 2FA", "UPDATE private.fake_session SET aal2 = false", /2FA/);
await refuses(
  "sem permissão",
  "UPDATE private.fake_session SET can_manage = false",
  /Sem permissão/,
);
await refuses("outra escola", null, /não existe nesta escola/, [KEEP, [FOREIGN]]);
await refuses("nada para juntar", null, /pelo menos uma/, [KEEP, [KEEP]]);
await refuses(
  "mesma turma",
  `INSERT INTO public.class_subjects (school_id, class_group_id, subject_id) VALUES ('${S}', '${T1}', '${DUP}')`,
  /mesma turma \(7ª A\)/,
);
await refuses(
  "ensino superior",
  `INSERT INTO public.program_subjects (school_id, subject_id) VALUES ('${S}', '${DUP}')`,
  /ensino superior/,
);
await refuses(
  "exame repetido",
  `INSERT INTO public.siga_exam_registrations (school_id, subject_id, session_id, enrollment_id) VALUES
     ('${S}', '${KEEP}', '${T1}', '${T1}'), ('${S}', '${DUP}', '${T1}', '${T1}')`,
  /mesmo exame/,
);
await refuses(
  "competência repetida",
  `UPDATE public.siga_competencies SET code = 'C1'`,
  /mesmo código/,
);
// 3. Um erro a meio (período fechado) desfaz tudo o que já tinha mudado.
await refuses(
  "período fechado",
  `UPDATE public.siga_assessment_items SET closed = true`,
  /Período fechado/,
);
assert.equal(
  await count(`SELECT count(*) n FROM public.curriculum_subjects`),
  2,
  "as ligações retiradas antes do erro voltam",
);

// 4. anon não executa.
await db.exec("SET ROLE anon");
await assert.rejects(merge(KEEP, [DUP]));
await db.exec("RESET ROLE");

console.log("merge-school-subjects: OK");
