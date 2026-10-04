// Ensaio local da leitura de comunicados (sem acesso à produção).
// Uso: node tests/sql/announcements-rls.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(read("./announcements-fixture.sql"));

// private.is_school_staff exactamente como na migração que a criou.
const staffMigration = read(
  "../../supabase/migrations/20260930130000_sensitive_tables_school_staff_only.sql",
);
const staffFunction = staffMigration.match(
  /CREATE OR REPLACE FUNCTION private\.is_school_staff[\s\S]*?\$\$;\s*REVOKE[^;]*;\s*GRANT[^;]*;/,
)?.[0];
assert.ok(staffFunction, "definição de private.is_school_staff não encontrada");
await db.exec(staffFunction);

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const users = {
  professor: "00000000-0000-0000-0000-000000000001",
  encarregado: "00000000-0000-0000-0000-000000000002",
  aluno: "00000000-0000-0000-0000-000000000003",
  tesouraria: "00000000-0000-0000-0000-000000000004",
  outraEscola: "00000000-0000-0000-0000-000000000005",
};
const member = async (school, user, code) => {
  const m = (
    await db.query("insert into school_memberships(school_id,user_id) values($1,$2) returning id", [
      school,
      user,
    ])
  ).rows[0].id;
  const r = (
    await db.query("insert into roles(school_id,code,name) values($1,$2,$2) returning id", [
      school,
      code,
    ])
  ).rows[0].id;
  await db.query("insert into member_roles(school_id,membership_id,role_id) values($1,$2,$3)", [
    school,
    m,
    r,
  ]);
};
await member(A, users.professor, "teacher");
await member(A, users.encarregado, "guardian");
await member(A, users.aluno, "student");
await member(A, users.tesouraria, "treasury");
await member(B, users.outraEscola, "guardian");

const announcement = (school, title, status, audience, deleted = false) =>
  db.query(
    "insert into school_announcements(school_id,title,body,status,audience,deleted_at) values($1,$2,'x',$3,$4,$5)",
    [school, title, status, audience, deleted ? new Date().toISOString() : null],
  );
await announcement(A, "enviado-encarregados", "sent", "all_guardians");
await announcement(A, "rascunho", "draft", "all_guardians");
await announcement(A, "agendado", "scheduled", "all_guardians");
await announcement(A, "enviado-corpo-docente", "sent", "teaching_staff");
await announcement(A, "apagado", "sent", "all_guardians", true);
await announcement(B, "outra-escola", "sent", "all_guardians");

/** Títulos que a conta lê com o papel `authenticated` (como a API e o tempo real). */
const visible = async (user) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
  const rows = (await db.query("select title from school_announcements order by title")).rows;
  await db.exec("reset role");
  return rows.map((r) => r.title);
};

// Antes: «é membro» chegava — o encarregado e o aluno liam rascunhos e avisos ao corpo docente.
assert.deepEqual(await visible(users.encarregado), [
  "agendado",
  "enviado-corpo-docente",
  "enviado-encarregados",
  "rascunho",
]);

const migration = read("../../supabase/migrations/20261004100000_announcements_read_by_role.sql");
await db.exec(migration);
await db.exec(migration); // idempotente: corre duas vezes sem erro

const allOfA = ["agendado", "enviado-corpo-docente", "enviado-encarregados", "rascunho"];
assert.deepEqual(await visible(users.professor), allOfA);
assert.deepEqual(await visible(users.tesouraria), allOfA);
assert.deepEqual(await visible(users.encarregado), ["enviado-encarregados"]);
assert.deepEqual(await visible(users.aluno), ["enviado-encarregados"]);
assert.deepEqual(await visible(users.outraEscola), ["outra-escola"]);
// Sem sessão não lê nada.
assert.deepEqual(await visible(""), []);

console.log(
  "comunicados: pessoal lê todos; alunos e encarregados só enviados e não do corpo docente; outra escola isolada; migração idempotente.",
);
