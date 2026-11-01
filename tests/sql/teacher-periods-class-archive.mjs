// Ensaio local (PGlite) de 20261030030000_teacher_periods_follow_class_archive.sql:
// arquivar a turma fecha a vigência dos professores, reactivá-la reabre-a.
// Sem produção. Executar:
// SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/teacher-periods-class-archive.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const periods = read("../../supabase/migrations/20261029220000_class_subject_teacher_periods.sql");
const archive = read(
  "../../supabase/migrations/20261030030000_teacher_periods_follow_class_archive.sql",
);

const S = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U = "99999999-9999-4999-8999-999999999999";
const T1 = "d0000000-0000-4000-8000-000000000001"; // turma que vai ser arquivada
const T2 = "d0000000-0000-4000-8000-000000000002"; // turma que continua activa
const T_OLD = "d0000000-0000-4000-8000-000000000003"; // já arquivada antes da migração
const CS1 = "c0000000-0000-4000-8000-000000000001"; // T1, professor A
const CS1_NONE = "c0000000-0000-4000-8000-000000000002"; // T1, sem professor
const CS1_OFF = "c0000000-0000-4000-8000-000000000003"; // T1, disciplina inactiva
const CS2 = "c0000000-0000-4000-8000-000000000004"; // T2, professor A
const CS_OLD = "c0000000-0000-4000-8000-000000000005"; // T_OLD, professor B

// Colunas e restrições capturadas (20260924005132_capture_undeclared_production_tables.sql).
const schema = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA private;
CREATE TABLE public.schools (id uuid PRIMARY KEY);
CREATE TABLE public.teachers (id uuid NOT NULL, school_id uuid NOT NULL,
  CONSTRAINT teachers_pkey PRIMARY KEY (id), CONSTRAINT teachers_school_id_id_key UNIQUE (school_id, id));
CREATE TABLE public.class_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL, school_id uuid NOT NULL,
  status text DEFAULT 'active'::text NOT NULL, updated_by uuid NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT class_groups_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text, 'archived'::text]))),
  CONSTRAINT class_groups_pkey PRIMARY KEY (id),
  CONSTRAINT class_groups_school_id_id_key UNIQUE (school_id, id));
CREATE TABLE public.class_subjects (
  id uuid DEFAULT gen_random_uuid() NOT NULL, school_id uuid NOT NULL, class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL, teacher_id uuid, weekly_periods smallint NOT NULL,
  status text DEFAULT 'active'::text NOT NULL, created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT class_subjects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT class_subjects_pkey PRIMARY KEY (id),
  CONSTRAINT class_subjects_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT class_subjects_school_id_class_group_id_fkey FOREIGN KEY (school_id, class_group_id)
    REFERENCES public.class_groups (school_id, id));
INSERT INTO public.schools VALUES ('${S}');
INSERT INTO public.teachers VALUES ('${A}', '${S}'), ('${B}', '${S}');
INSERT INTO public.class_groups (id, school_id, status, updated_by, updated_at) VALUES
  ('${T1}', '${S}', 'active', '${U}', now()),
  ('${T2}', '${S}', 'active', '${U}', now()),
  ('${T_OLD}', '${S}', 'active', '${U}', now());
INSERT INTO public.class_subjects (id, school_id, class_group_id, subject_id, teacher_id,
  weekly_periods, status, created_by, updated_by, created_at) VALUES
  ('${CS1}', '${S}', '${T1}', gen_random_uuid(), '${A}', 4, 'active', '${U}', '${U}', '2026-02-10 09:00+01'),
  ('${CS1_NONE}', '${S}', '${T1}', gen_random_uuid(), NULL, 4, 'active', '${U}', '${U}', now()),
  ('${CS1_OFF}', '${S}', '${T1}', gen_random_uuid(), '${B}', 4, 'inactive', '${U}', '${U}', now()),
  ('${CS2}', '${S}', '${T2}', gen_random_uuid(), '${A}', 4, 'active', '${U}', '${U}', '2026-02-10 09:00+01'),
  ('${CS_OLD}', '${S}', '${T_OLD}', gen_random_uuid(), '${B}', 4, 'active', '${U}', '${U}', '2026-02-10 09:00+01');
`;

// 1. Sem a vigência de 20261029220000, pára com uma mensagem clara.
{
  const db = new PGlite();
  try {
    await db.exec(schema);
    await assert.rejects(db.exec(archive), /Aplique primeiro 20261029220000/);
  } finally {
    await db.close();
  }
}

const db = new PGlite();
await db.exec(schema);
await db.exec(periods);
// Defeito de 20261029220000: arquivar a turma não fecha nada.
await db.exec(
  `UPDATE public.class_groups SET status = 'archived', updated_at = '2026-06-15 10:00+01'
    WHERE id = '${T_OLD}'`,
);
const open = async (cs) =>
  (
    await db.query(
      `SELECT count(*)::int AS n FROM public.class_subject_teacher_periods
        WHERE class_subject_id = $1 AND ends_on IS NULL`,
      [cs],
    )
  ).rows[0].n;
assert.equal(await open(CS_OLD), 1, "antes da migração o período fica aberto");

// A sonda de SIGA_confirmar_migracoes.sql para esta migração, avaliada sozinha.
const confirmar = read("../../docs/agents/SIGA_confirmar_migracoes.sql");
const chave = "('20261030030000_teacher_periods_follow_class_archive',";
assert.ok(confirmar.indexOf(chave) > 0, "sonda em falta em SIGA_confirmar_migracoes.sql");
const expressao = confirmar.slice(confirmar.indexOf(chave) + chave.length).split(/\),\n/)[0];
const sonda = async () => (await db.query(`select (${expressao}) as ok`)).rows[0].ok;
assert.equal(await sonda(), false);

await db.exec(archive);
await db.exec(archive);
assert.equal(await sonda(), true);

const rows = async (cs) =>
  (
    await db.query(
      `SELECT teacher_id, starts_on::text, ends_on::text, end_reason
         FROM public.class_subject_teacher_periods WHERE class_subject_id = $1
        ORDER BY created_at, starts_on, ends_on NULLS LAST`,
      [cs],
    )
  ).rows;
const today = (await db.query(`SELECT (now() AT TIME ZONE 'Africa/Luanda')::date::text AS d`))
  .rows[0].d;

// Turma já arquivada: o período fecha na data da última alteração da turma.
assert.deepEqual(await rows(CS_OLD), [
  { teacher_id: B, starts_on: "2026-02-10", ends_on: "2026-06-15", end_reason: "class_archived" },
]);

// Arquivar T1 fecha só os períodos de T1; T2 continua em vigor.
await db.exec(`UPDATE public.class_groups SET status = 'archived' WHERE id = '${T1}'`);
assert.deepEqual(await rows(CS1), [
  { teacher_id: A, starts_on: "2026-02-10", ends_on: today, end_reason: "class_archived" },
]);
assert.deepEqual(await rows(CS1_NONE), []);
assert.deepEqual(await rows(CS1_OFF), []);
assert.equal(await open(CS2), 1);

// Mudar outra coisa na turma arquivada, ou arquivá-la de novo, não toca na vigência.
await db.exec(`UPDATE public.class_groups SET updated_at = now() WHERE id = '${T1}'`);
assert.equal((await rows(CS1)).length, 1);

// Atribuir professor numa turma arquivada não o põe em vigor.
await db.exec(`UPDATE public.class_subjects SET teacher_id = '${B}' WHERE id = '${CS1_NONE}'`);
assert.deepEqual(await rows(CS1_NONE), []);
// Trocar de professor numa turma arquivada também não abre período.
await db.exec(`UPDATE public.class_subjects SET teacher_id = '${B}' WHERE id = '${CS1}'`);
assert.equal(await open(CS1), 0);

// Reactivar: reabre um período (início hoje) para cada disciplina activa com professor.
await db.exec(`UPDATE public.class_groups SET status = 'active' WHERE id = '${T1}'`);
assert.deepEqual((await rows(CS1)).at(-1), {
  teacher_id: B,
  starts_on: today,
  ends_on: null,
  end_reason: null,
});
assert.deepEqual(await rows(CS1_NONE), [
  { teacher_id: B, starts_on: today, ends_on: null, end_reason: null },
]);
assert.deepEqual(await rows(CS1_OFF), [], "disciplina inactiva continua sem período");
// Reactivar duas vezes não duplica (o índice único também o impediria).
await db.exec(`UPDATE public.class_groups SET status = 'closed' WHERE id = '${T1}'`);
await db.exec(`UPDATE public.class_groups SET status = 'active' WHERE id = '${T1}'`);
assert.equal(await open(CS1), 1);
assert.equal(await open(CS1_NONE), 1);

// O comportamento anterior mantém-se nas turmas activas.
await db.exec(`UPDATE public.class_subjects SET teacher_id = '${B}' WHERE id = '${CS2}'`);
let r = await rows(CS2);
assert.equal(r.length, 2);
assert.equal(r[0].end_reason, "teacher_changed");
assert.equal(r[1].teacher_id, B);
await db.exec(`UPDATE public.class_subjects SET status = 'inactive' WHERE id = '${CS2}'`);
r = await rows(CS2);
assert.equal(r.at(-1).end_reason, "inactive");
await db.exec(
  `UPDATE public.class_subjects SET teacher_id = NULL, status = 'active' WHERE id = '${CS2}'`,
);
assert.equal(await open(CS2), 0);

// Motivo desconhecido continua recusado.
await assert.rejects(
  db.exec(
    `UPDATE public.class_subject_teacher_periods SET end_reason = 'outro' WHERE class_subject_id = '${CS_OLD}'`,
  ),
  /end_reason_check/,
);

// Funções do gatilho sem EXECUTE para a API.
for (const fn of ["track_class_group_teacher_periods", "track_class_subject_teacher_period"]) {
  for (const role of ["anon", "authenticated"]) {
    const { rows: priv } = await db.query(
      `SELECT has_function_privilege($1, 'private.${fn}()', 'EXECUTE') AS ok`,
      [role],
    );
    assert.equal(priv[0].ok, false, `${role} sem EXECUTE em ${fn}`);
  }
}

await db.close();
console.log(
  "teacher-periods-class-archive: arquivo, reactivação, turmas antigas e idempotência OK",
);
