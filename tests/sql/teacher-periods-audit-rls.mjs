// Ensaio local (PGlite) do pacote docs/agents/SIGA_aplicar_vigencia_docente_auditoria_2026-10-29.sql:
// 20261029220000_class_subject_teacher_periods.sql e 20261029220100_audit_logs_force_rls.sql.
// Sem produção. Executar:
// SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/teacher-periods-audit-rls.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const periods = read("../../supabase/migrations/20261029220000_class_subject_teacher_periods.sql");
const audit = read("../../supabase/migrations/20261029220100_audit_logs_force_rls.sql");
const pacote = read("../../docs/agents/SIGA_aplicar_vigencia_docente_auditoria_2026-10-29.sql");
assert.ok(pacote.includes(periods), "o pacote leva a migração da vigência tal e qual");
assert.ok(pacote.includes(audit), "o pacote leva a migração da auditoria tal e qual");

const S = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U = "99999999-9999-4999-8999-999999999999";
const CS = "c0000000-0000-4000-8000-000000000001"; // activa com professor
const CS_OFF = "c0000000-0000-4000-8000-000000000002"; // inactiva
const CS_NONE = "c0000000-0000-4000-8000-000000000003"; // sem professor

const db = new PGlite();
// Colunas e restrições capturadas (20260924005132_capture_undeclared_production_tables.sql)
// e a política/gatilho de audit_logs lidos do retrato de 2026-10-29.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA private;
CREATE TABLE public.schools (id uuid PRIMARY KEY);
CREATE TABLE public.teachers (id uuid NOT NULL, school_id uuid NOT NULL,
  CONSTRAINT teachers_pkey PRIMARY KEY (id), CONSTRAINT teachers_school_id_id_key UNIQUE (school_id, id));
CREATE TABLE public.class_subjects (
  id uuid DEFAULT gen_random_uuid() NOT NULL, school_id uuid NOT NULL, class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL, teacher_id uuid, weekly_periods smallint NOT NULL,
  status text DEFAULT 'active'::text NOT NULL, created_by uuid NOT NULL, updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT class_subjects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT class_subjects_pkey PRIMARY KEY (id),
  CONSTRAINT class_subjects_school_id_class_group_id_subject_id_key UNIQUE (school_id, class_group_id, subject_id),
  CONSTRAINT class_subjects_school_id_id_key UNIQUE (school_id, id));
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects FORCE ROW LEVEL SECURITY;

CREATE TABLE public.audit_logs (id bigserial PRIMARY KEY, school_id uuid NOT NULL, actor_user_id uuid,
  action text NOT NULL, entity_type text NOT NULL, entity_id uuid, request_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION private.prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_logs é só de acrescentar'; END $$;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_mutation();
CREATE POLICY audit_select_authorized ON public.audit_logs FOR SELECT TO authenticated
  USING (school_id = '${S}');
-- Pior caso: privilégios por omissão do Supabase para as duas funções da API.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.audit_logs TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq TO anon, authenticated, service_role;

INSERT INTO public.schools VALUES ('${S}'), ('${S2}');
INSERT INTO public.teachers VALUES ('${A}', '${S}'), ('${B}', '${S}');
INSERT INTO public.class_subjects (id, school_id, class_group_id, subject_id, teacher_id,
  weekly_periods, status, created_by, updated_by, created_at) VALUES
  ('${CS}', '${S}', gen_random_uuid(), gen_random_uuid(), '${A}', 4, 'active', '${U}', '${U}', '2026-02-10 09:00+01'),
  ('${CS_OFF}', '${S}', gen_random_uuid(), gen_random_uuid(), '${B}', 4, 'inactive', '${U}', '${U}', now()),
  ('${CS_NONE}', '${S}', gen_random_uuid(), gen_random_uuid(), NULL, 4, 'active', '${U}', '${U}', now());
INSERT INTO public.audit_logs (school_id, action, entity_type) VALUES ('${S}', 'x', 'y'), ('${S2}', 'x', 'y');
`);

const confirmar = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const sonda = async () => Object.values((await db.query(confirmar)).rows[0]);
assert.deepEqual(await sonda(), ["por aplicar", "por aplicar"]);

await db.exec(pacote);
await db.exec(pacote);
assert.deepEqual(await sonda(), ["aplicada", "aplicada"]);

const rows = async (cs) =>
  (
    await db.query(
      `SELECT teacher_id, starts_on::text, ends_on::text, end_reason, estimated_start
         FROM public.class_subject_teacher_periods WHERE class_subject_id = $1
        ORDER BY created_at, starts_on, ends_on NULLS LAST`,
      [cs],
    )
  ).rows;
const today = (await db.query(`SELECT (now() AT TIME ZONE 'Africa/Luanda')::date::text AS d`))
  .rows[0].d;

// Preenchimento: só a atribuição activa com professor; corrido duas vezes, um só período.
assert.deepEqual(await rows(CS), [
  {
    teacher_id: A,
    starts_on: "2026-02-10",
    ends_on: null,
    end_reason: null,
    estimated_start: true,
  },
]);
assert.deepEqual(await rows(CS_OFF), []);
assert.deepEqual(await rows(CS_NONE), []);

// Mudar a carga horária não toca na vigência.
await db.exec(`UPDATE public.class_subjects SET weekly_periods = 5 WHERE id = '${CS}'`);
assert.equal((await rows(CS)).length, 1);

// Trocar de professor: fecha o de A, abre o de B.
await db.exec(`UPDATE public.class_subjects SET teacher_id = '${B}' WHERE id = '${CS}'`);
let r = await rows(CS);
assert.equal(r.length, 2);
assert.deepEqual(r[0], {
  teacher_id: A,
  starts_on: "2026-02-10",
  ends_on: today,
  end_reason: "teacher_changed",
  estimated_start: true,
});
assert.deepEqual(r[1], {
  teacher_id: B,
  starts_on: today,
  ends_on: null,
  end_reason: null,
  estimated_start: false,
});

// Desligar o professor fecha sem abrir; voltar a atribuir abre outro.
await db.exec(`UPDATE public.class_subjects SET teacher_id = NULL WHERE id = '${CS}'`);
r = await rows(CS);
assert.equal(r.filter((p) => p.ends_on === null).length, 0);
assert.equal(r.at(-1).end_reason, "unassigned");
await db.exec(`UPDATE public.class_subjects SET teacher_id = '${A}' WHERE id = '${CS}'`);
assert.equal((await rows(CS)).filter((p) => p.ends_on === null).length, 1);

// Desactivar a disciplina fecha; reactivar reabre.
await db.exec(`UPDATE public.class_subjects SET status = 'inactive' WHERE id = '${CS}'`);
r = await rows(CS);
assert.equal(r.at(-1).end_reason, "inactive");
assert.equal(r.filter((p) => p.ends_on === null).length, 0);
await db.exec(`UPDATE public.class_subjects SET status = 'active' WHERE id = '${CS}'`);
assert.equal((await rows(CS)).filter((p) => p.ends_on === null).length, 1);

// Atribuição nova já com professor: abre logo.
await db.exec(`INSERT INTO public.class_subjects (school_id, class_group_id, subject_id, teacher_id,
  weekly_periods, created_by, updated_by) VALUES ('${S}', gen_random_uuid(), gen_random_uuid(), '${B}', 3, '${U}', '${U}')`);
assert.equal(
  (
    await db.query(
      `SELECT count(*)::int AS n FROM public.class_subject_teacher_periods
        WHERE teacher_id = '${B}' AND ends_on IS NULL`,
    )
  ).rows[0].n,
  1,
);

// Um só período em vigor por atribuição, e datas coerentes.
await assert.rejects(
  db.exec(`INSERT INTO public.class_subject_teacher_periods (school_id, class_subject_id, teacher_id, starts_on)
           VALUES ('${S}', '${CS}', '${B}', '2026-03-01')`),
);
await assert.rejects(
  db.exec(`INSERT INTO public.class_subject_teacher_periods (school_id, class_subject_id, teacher_id, starts_on, ends_on)
           VALUES ('${S}', '${CS}', '${B}', '2026-03-01', '2026-02-01')`),
);
// Professor de outra escola não entra num período desta.
await assert.rejects(
  db.exec(`INSERT INTO public.class_subject_teacher_periods (school_id, class_subject_id, teacher_id, starts_on, ends_on)
           VALUES ('${S2}', '${CS}', '${A}', '2026-03-01', '2026-03-02')`),
);

const as = async (role, sql) => {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
};

// Vigência: só o servidor.
for (const role of ["anon", "authenticated"]) {
  await assert.rejects(as(role, "SELECT * FROM public.class_subject_teacher_periods"));
}
assert.ok(
  (await as("service_role", "SELECT * FROM public.class_subject_teacher_periods")).rows.length,
);

// Auditoria: RLS forçada, anon sem nada, authenticated só lê o que a política deixa.
assert.equal(
  (
    await db.query(
      "SELECT relforcerowsecurity AS f FROM pg_class WHERE oid = 'public.audit_logs'::regclass",
    )
  ).rows[0].f,
  true,
);
await assert.rejects(as("anon", "SELECT * FROM public.audit_logs"));
await assert.rejects(
  as(
    "authenticated",
    `INSERT INTO public.audit_logs (school_id, action, entity_type) VALUES ('${S}', 'x', 'y')`,
  ),
);
await assert.rejects(as("authenticated", "DELETE FROM public.audit_logs"));
await assert.rejects(as("authenticated", "TRUNCATE public.audit_logs"));
assert.equal((await as("authenticated", "SELECT * FROM public.audit_logs")).rows.length, 1);
await as(
  "service_role",
  `INSERT INTO public.audit_logs (school_id, action, entity_type) VALUES ('${S}', 'servidor', 'y')`,
);
// O gatilho de imutabilidade continua a valer para todos.
await assert.rejects(as("service_role", "DELETE FROM public.audit_logs"));

console.log("vigência docente e auditoria protegida: ok");
