// Ensaio local (PGlite) de 20261012140000_numbering_one_year_digits.sql. Sem produção.
// Uso: node tests/sql/numbering-one-year-digits.mjs (ver tests/sql/README.md).
// As tabelas têm só as colunas que a migração e as funções usam, com as restrições,
// gatilhos de identidade e formatos antigos (EST-/MAT-) que estão em produção (12/10/2026).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261012140000_numbering_one_year_digits.sql",
    import.meta.url,
  ),
  "utf8",
);
const db = new PGlite();
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const USER = "00000000-0000-4000-8000-0000000000ff";
const YEAR = Number(
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda", year: "numeric" }).format(
    new Date(),
  ),
);
const yy = String(YEAR % 100).padStart(2, "0");

const schema = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${USER}'::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION private.has_permission(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION private.is_active_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.schools (id uuid PRIMARY KEY);
INSERT INTO public.schools VALUES ('${A}'), ('${B}');
CREATE TABLE public.people (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, status text NOT NULL DEFAULT 'active');
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, person_id uuid NOT NULL,
  student_number text NOT NULL, admission_date date, status text NOT NULL DEFAULT 'applicant',
  created_by uuid, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_student_number_check CHECK (student_number ~ '^EST-[0-9]{6,}$'),
  CONSTRAINT students_school_id_student_number_key UNIQUE (school_id, student_number)
);
CREATE TABLE public.student_guardians (school_id uuid, student_id uuid, guardian_person_id uuid, relationship text,
  is_primary boolean, is_financially_responsible boolean, is_pickup_authorized boolean, created_by uuid);
CREATE TABLE public.academic_years (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  starts_on date NOT NULL, ends_on date NOT NULL, status text NOT NULL DEFAULT 'active');
CREATE TABLE public.class_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL, capacity integer NOT NULL DEFAULT 40, status text NOT NULL DEFAULT 'active');
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, academic_year_id uuid NOT NULL,
  class_group_id uuid NOT NULL, student_id uuid NOT NULL, enrollment_number text NOT NULL, enrolled_on date,
  status text NOT NULL DEFAULT 'active', created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollments_enrollment_number_check CHECK (enrollment_number ~ '^MAT-[0-9]{6,}$'),
  CONSTRAINT enrollments_school_id_enrollment_number_key UNIQUE (school_id, enrollment_number)
);
CREATE TABLE public.document_sequences (school_id uuid, document_type text, prefix text NOT NULL,
  next_number integer NOT NULL DEFAULT 1, padding integer NOT NULL DEFAULT 6, updated_at timestamptz,
  PRIMARY KEY (school_id, document_type));
CREATE TABLE public.issued_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  document_number text NOT NULL, document_type text NOT NULL DEFAULT 'declaration', issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issued_documents_school_id_document_number_key UNIQUE (school_id, document_number));
CREATE FUNCTION private.protect_student_identity() RETURNS trigger LANGUAGE plpgsql AS $$
begin
  if new.student_number <> old.student_number then
    raise exception using errcode = '22023', message = 'Identidade institucional do estudante é imutável.';
  end if;
  return new;
end $$;
CREATE TRIGGER protect_student_identity BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.protect_student_identity();
CREATE FUNCTION private.protect_enrollment_identity() RETURNS trigger LANGUAGE plpgsql AS $$
begin
  if new.enrollment_number <> old.enrollment_number then
    raise exception using errcode = '22023', message = 'Identidade da matrícula é imutável.';
  end if;
  return new;
end $$;
CREATE TRIGGER protect_enrollment_identity BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION private.protect_enrollment_identity();
`;
await db.exec(schema);

// Dados de antes: números antigos, por ordem de criação diferente da ordem dos números.
const yearA = (
  await db.query(
    `INSERT INTO academic_years (school_id, starts_on, ends_on) VALUES ($1, '2026-09-01', '2027-07-31') RETURNING id`,
    [A],
  )
).rows[0].id;
const groupA = (
  await db.query(
    `INSERT INTO class_groups (school_id, academic_year_id) VALUES ($1, $2) RETURNING id`,
    [A, yearA],
  )
).rows[0].id;
const student = async (school, number, admitted, at) => {
  const person = (
    await db.query(`INSERT INTO people (school_id) VALUES ($1) RETURNING id`, [school])
  ).rows[0].id;
  return (
    await db.query(
      `INSERT INTO students (school_id, person_id, student_number, admission_date, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [school, person, number, admitted, at],
    )
  ).rows[0].id;
};
const s1 = await student(A, "EST-900038", "2026-02-01", "2026-02-01T10:00:00Z");
const s2 = await student(A, "EST-900004", "2026-02-01", "2026-02-02T10:00:00Z");
const s3 = await student(A, "EST-000001", "2025-03-01", "2025-03-01T10:00:00Z");
const s4 = await student(B, "EST-900001", "2026-05-01", "2026-05-01T10:00:00Z");
await db.query(
  `INSERT INTO enrollments (school_id, academic_year_id, class_group_id, student_id, enrollment_number, created_at)
   VALUES ($1,$2,$3,$4,'MAT-980005','2026-09-02'), ($1,$2,$3,$5,'MAT-980001','2026-09-03')`,
  [A, yearA, groupA, s1, s2],
);
await db.query(
  `INSERT INTO document_sequences (school_id, document_type, prefix, padding) VALUES ($1,'invoice','FT',4), ($1,'declaration','DC',6)`,
  [A],
);

await db.exec(migration);
const numbers = async (table, column, school) =>
  (
    await db.query(`SELECT ${column} AS n FROM ${table} WHERE school_id = $1 ORDER BY created_at`, [
      school,
    ])
  ).rows.map((r) => r.n);

assert.deepEqual(
  await numbers("students", "student_number", A),
  ["1250001", "1260001", "1260002"],
  "alunos por ano de admissão e ordem de criação",
);
assert.deepEqual(
  await numbers("students", "student_number", B),
  ["1260001"],
  "cada escola tem a sua contagem",
);
assert.deepEqual(
  await numbers("enrollments", "enrollment_number", A),
  ["1260001", "1260002"],
  "matrículas pelo ano lectivo",
);

// A protecção da identidade volta a valer depois da troca.
await assert.rejects(
  db.query(`UPDATE students SET student_number = '1269999' WHERE id = $1`, [s1]),
  /imutável/,
);
// Só o formato novo é aceite.
await assert.rejects(
  db.query(
    `INSERT INTO students (school_id, person_id, student_number) VALUES ($1, gen_random_uuid(), 'EST-000777')`,
    [A],
  ),
  /students_student_number_check/,
);
await assert.rejects(
  db.query(
    `INSERT INTO students (school_id, person_id, student_number) VALUES ($1, gen_random_uuid(), '12600011')`,
    [A],
  ),
  /students_student_number_check/,
);

// Números novos: continuam a seguir aos existentes.
const register = async (school, admitted) => {
  const person = (
    await db.query(`INSERT INTO people (school_id) VALUES ($1) RETURNING id`, [school])
  ).rows[0].id;
  return (
    await db.query(`SELECT private.register_student($1, $2, $3::date) AS r`, [
      school,
      person,
      admitted,
    ])
  ).rows[0].r;
};
assert.equal((await register(A, "2026-06-01")).studentNumber, "1260003");
assert.equal((await register(A, "2025-06-01")).studentNumber, "1250002");
assert.equal((await register(B, "2026-06-01")).studentNumber, "1260002");
const enrolled = (
  await db.query(`SELECT private.enroll_student($1, $2, $3, '2026-10-01') AS r`, [A, s3, groupA])
).rows[0].r;
assert.equal(
  enrolled.enrollmentNumber,
  "1260003",
  "matrícula segue as existentes do mesmo ano lectivo",
);

// Documentos da escola só com dígitos; os fiscais mantêm a série.
assert.equal(
  (await db.query(`SELECT private.next_document_number($1, 'declaration', 'DEC') AS n`, [A]))
    .rows[0].n,
  `1${yy}0001`,
);
assert.equal(
  (await db.query(`SELECT private.next_document_number_service($1, 'certificate', 'CE') AS n`, [A]))
    .rows[0].n,
  `1${yy}0002`,
);
assert.equal(
  (await db.query(`SELECT private.next_document_number($1, 'other', 'ARQ') AS n`, [A])).rows[0].n,
  `1${yy}0003`,
);
assert.equal(
  (await db.query(`SELECT private.next_document_number($1, 'invoice') AS n`, [A])).rows[0].n,
  "FT-0001",
);
assert.equal(
  (await db.query(`SELECT private.next_document_number_service($1, 'receipt', 'REC') AS n`, [A]))
    .rows[0].n,
  "REC-000001",
);

// Limite: 9999 por escola, tipo e ano.
await db.query(
  `UPDATE private.siga_year_sequences SET next_number = 9999 WHERE school_id = $1 AND kind = 'student' AND year = 2026`,
  [A],
);
assert.equal((await register(A, "2026-07-01")).studentNumber, "1269999");
await assert.rejects(register(A, "2026-07-02"), /9999 números de aluno de 2026/);

// Segunda passagem: nada muda e os contadores não recuam.
const before = await numbers("students", "student_number", A);
await db.exec(migration);
assert.deepEqual(
  await numbers("students", "student_number", A),
  before,
  "a migração pode correr duas vezes",
);
assert.equal(
  (
    await db.query(
      `SELECT next_number FROM private.siga_year_sequences WHERE school_id = $1 AND kind = 'student' AND year = 2026`,
      [A],
    )
  ).rows[0].next_number,
  10000,
);
// Ano fora do intervalo.
await assert.rejects(
  db.query(`SELECT private.next_year_number($1, 'student', 1999)`, [A]),
  /Ano inválido/,
);

console.log("Numeração 1+ano+4 dígitos: ensaio local aprovado (PGlite, sem produção).");

// Regressões da revisão #148: bases isoladas, sem tocar na produção.
async function scenario(seed, check) {
  const isolated = new PGlite();
  try {
    await isolated.exec(schema);
    await isolated.exec(seed);
    await check(isolated);
  } finally {
    await isolated.close();
  }
}
const oldStudent = (number, date) => `INSERT INTO students
  (school_id, person_id, student_number, admission_date)
  VALUES ('${A}', gen_random_uuid(), '${number}', ${date === null ? "NULL" : `'${date}'`});`;
for (const date of [null, "1999-01-01", "2100-01-01"]) {
  await scenario(oldStudent("EST-000001", date), async (d) => {
    await assert.rejects(d.exec(migration), /Renumeração recusada/);
    assert.equal(
      (await d.query("SELECT student_number FROM students")).rows[0].student_number,
      "EST-000001",
    );
    assert.equal(
      (await d.query("SELECT tgenabled FROM pg_trigger WHERE tgname = 'protect_student_identity'"))
        .rows[0].tgenabled,
      "O",
    );
  });
}
const acceptMixed = `ALTER TABLE students DROP CONSTRAINT students_student_number_check;`;
for (const number of ["1250001", "1260000"]) {
  await scenario(acceptMixed + oldStudent(number, "2026-01-01"), async (d) => {
    await assert.rejects(d.exec(migration), /sequência zero ou ano divergente/);
  });
}
await scenario(
  acceptMixed + oldStudent("1269999", "2026-01-01") + oldStudent("EST-000001", "2026-01-02"),
  async (d) => {
    await assert.rejects(d.exec(migration), /excede 9999/);
    assert.deepEqual(
      (await d.query("SELECT student_number FROM students ORDER BY student_number")).rows.map(
        (r) => r.student_number,
      ),
      ["1269999", "EST-000001"],
    );
  },
);
await scenario(
  acceptMixed + oldStudent("1260042", "2026-01-01") + oldStudent("EST-000001", "2026-01-02"),
  async (d) => {
    await d.exec(migration);
    assert.equal(
      (await d.query("SELECT student_number FROM students WHERE admission_date = '2026-01-02'"))
        .rows[0].student_number,
      "1260043",
    );
    const map = (await d.query("SELECT old_number, new_number FROM private.siga_numbering_changes"))
      .rows;
    assert.deepEqual(map, [{ old_number: "EST-000001", new_number: "1260043" }]);
    await d.exec(migration);
    assert.equal(
      (await d.query("SELECT count(*)::int AS n FROM private.siga_numbering_changes")).rows[0].n,
      1,
    );
    await assert.rejects(
      d.exec("SET ROLE anon; SELECT * FROM private.siga_numbering_changes"),
      /permission denied/,
    );
    await d.exec("RESET ROLE");
    await assert.rejects(
      d.query(
        "INSERT INTO students (school_id, person_id, student_number) VALUES ($1, gen_random_uuid(), '1260000')",
        [A],
      ),
      /students_student_number_check/,
    );
  },
);
await scenario(
  `INSERT INTO issued_documents (school_id, document_number, issued_at)
  VALUES ('${A}', 'DEC-000001', '2026-02-01T10:00:00Z'),
         ('${A}', '1260042', '2026-02-02T10:00:00Z'),
         ('${B}', 'DEC-000002', '2025-12-31T23:30:00Z');`,
  async (d) => {
    await d.exec(migration);
    assert.deepEqual(
      (
        await d.query("SELECT document_number FROM issued_documents ORDER BY school_id, issued_at")
      ).rows.map((r) => r.document_number),
      ["1260043", "1260042", "1260001"],
    );
    assert.equal(
      (await d.query("SELECT private.next_document_number_service($1, 'declaration') AS n", [A]))
        .rows[0].n,
      `1${yy}${YEAR === 2026 ? "0044" : "0001"}`,
    );
    await d.exec(migration);
    assert.equal(
      (
        await d.query(
          "SELECT count(*)::int AS n FROM private.siga_numbering_changes WHERE kind = 'document'",
        )
      ).rows[0].n,
      2,
    );
  },
);
// A matrícula precisa de um ano pertencente à própria escola.
await scenario(
  `INSERT INTO academic_years (id, school_id, starts_on, ends_on)
  VALUES ('00000000-0000-4000-8000-000000000010', '${B}', '2026-01-01', '2026-12-31');
  INSERT INTO enrollments (school_id, academic_year_id, class_group_id, student_id, enrollment_number)
  VALUES ('${A}', '00000000-0000-4000-8000-000000000010', gen_random_uuid(), gen_random_uuid(), 'MAT-000001');`,
  async (d) => {
    await assert.rejects(d.exec(migration), /Renumeração recusada/);
    assert.equal(
      (await d.query("SELECT enrollment_number FROM enrollments")).rows[0].enrollment_number,
      "MAT-000001",
    );
  },
);
// O limite do lote aplica-se também à categoria documental.
await scenario(
  `INSERT INTO issued_documents (school_id, document_number, issued_at)
  VALUES ('${A}', '1269999', '2026-01-01T10:00:00Z'), ('${A}', 'DEC-000001', '2026-01-02T10:00:00Z');`,
  async (d) => {
    await assert.rejects(d.exec(migration), /excede 9999/);
    assert.equal(
      (
        await d.query(
          "SELECT count(*)::int AS n FROM issued_documents WHERE document_number = 'DEC-000001'",
        )
      ).rows[0].n,
      1,
    );
  },
);
// Mesmo se houver documentos fiscais nesta tabela, o lote deixa-os intactos.
await scenario(
  `INSERT INTO issued_documents (school_id, document_number, document_type, issued_at)
  VALUES ('${A}', 'FT-000001', 'invoice', '2026-01-01T10:00:00Z'),
         ('${A}', 'REC-000001', 'receipt', '2026-01-01T10:00:00Z'),
         ('${A}', 'NC-000001', 'credit_note', '2026-01-01T10:00:00Z'),
         ('${A}', 'DES-000001', 'expense', '2026-01-01T10:00:00Z');`,
  async (d) => {
    await d.exec(migration);
    assert.equal(
      (await d.query("SELECT count(*)::int AS n FROM private.siga_numbering_changes")).rows[0].n,
      0,
    );
    assert.deepEqual(
      (
        await d.query("SELECT document_number FROM issued_documents ORDER BY document_number")
      ).rows.map((r) => r.document_number),
      ["DES-000001", "FT-000001", "NC-000001", "REC-000001"],
    );
  },
);
// Uma falha depois dos UPDATE tem de restaurar números, mapa e gatilhos.
await scenario(oldStudent("EST-000001", "2026-01-01"), async (d) => {
  await assert.rejects(d.exec(migration + "\nSELECT 1 / 0;"), /division by zero/);
  assert.equal(
    (await d.query("SELECT student_number FROM students")).rows[0].student_number,
    "EST-000001",
  );
  assert.equal(
    (await d.query("SELECT to_regclass('private.siga_numbering_changes') AS t")).rows[0].t,
    null,
  );
  await assert.rejects(d.exec("UPDATE students SET student_number = 'EST-000002'"), /imutável/);
});
await db.close();
console.log(
  "Revisão #148: preflight, limite em lote, mapa, documentos existentes e rollback aprovados.",
);
