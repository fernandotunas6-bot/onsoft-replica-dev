// Ensaio isolado do processo documental docente: sem dados nem credenciais de produção.
// node tests/sql/teacher-document-entries.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
const db = new PGlite();
const ids = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  teacherA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  teacherB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  personA: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  personB: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  fileA: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  fileB: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  actor: "99999999-9999-4999-8999-999999999999",
};
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.schools (id uuid PRIMARY KEY);
    CREATE TABLE public.people (id uuid PRIMARY KEY, school_id uuid);
    CREATE TABLE public.teachers (id uuid PRIMARY KEY, school_id uuid, person_id uuid);
    CREATE TABLE public.siga_files (
      id uuid PRIMARY KEY, school_id uuid, related_person_id uuid, area text,
      visibility text, storage_backend text, deleted_at timestamptz,
      is_folder boolean, is_system boolean, reference_code text
    );
  `);
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261029190000_teacher_document_entries.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(`
    INSERT INTO auth.users VALUES ('${ids.actor}');
    INSERT INTO public.schools VALUES ('${ids.a}'),('${ids.b}');
    INSERT INTO public.people VALUES ('${ids.personA}','${ids.a}'),('${ids.personB}','${ids.b}');
    INSERT INTO public.teachers VALUES ('${ids.teacherA}','${ids.a}','${ids.personA}'),
      ('${ids.teacherB}','${ids.b}','${ids.personB}');
    INSERT INTO public.siga_files VALUES
      ('${ids.fileA}','${ids.a}','${ids.personA}','secretaria','private','sga',null,false,false,'BI-261029-X7Y8'),
      ('${ids.fileB}','${ids.b}','${ids.personB}','secretaria','private','sga',null,false,false,'DOC-261029-B2C3');
  `);
  const insert = (school, teacher, person, file, code = "bi") => `
    INSERT INTO public.teacher_document_entries
      (school_id,teacher_id,person_id,file_id,document_code,created_by,updated_by)
    VALUES ('${school}','${teacher}','${person}','${file}','${code}','${ids.actor}','${ids.actor}');
  `;
  await db.exec(insert(ids.a, ids.teacherA, ids.personA, ids.fileA));
  const { rows: references } = await db.query(
    "SELECT reference_code FROM public.siga_files WHERE id = $1",
    [ids.fileA],
  );
  assert.equal(references[0].reference_code, "BI-261029-X7Y8", "não alterar o ID do Arquivo");
  await assert.rejects(
    db.exec(insert(ids.a, ids.teacherB, ids.personA, ids.fileB)),
    /Anexo docente incompatível/,
  );
  await assert.rejects(
    db.exec(insert(ids.b, ids.teacherB, ids.personA, ids.fileA)),
    /Anexo docente incompatível/,
  );
  await assert.rejects(
    db.exec(insert(ids.a, ids.teacherA, ids.personA, ids.fileB)),
    /Anexo docente incompatível/,
  );
  await assert.rejects(
    db.exec(insert(ids.b, ids.teacherB, ids.personB, ids.fileB, "tipo_falso")),
    /check constraint/,
  );
  const { rows: security } = await db.query(
    "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='public.teacher_document_entries'::regclass",
  );
  assert.equal(security[0].relrowsecurity, true);
  assert.equal(security[0].relforcerowsecurity, true);
  const { rows: access } = await db.query(`
    SELECT has_table_privilege('authenticated', 'public.teacher_document_entries', 'SELECT') AS read,
           has_table_privilege('authenticated', 'public.teacher_document_entries', 'INSERT') AS write
  `);
  assert.equal(access[0].read, false);
  assert.equal(access[0].write, false);
  console.log("teacher-document-entries: tenant, arquivo, documento e acesso privado OK");
} finally {
  await db.close();
}
