// Ensaio local (PGlite) de 20261002100000_chat_integrity.sql sobre a migração do chat
// capturada da produção (20261002062355). Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/chat-integrity.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.schools (id uuid PRIMARY KEY);
CREATE TABLE public.students (id uuid PRIMARY KEY);
CREATE TABLE public.siga_files (id uuid PRIMARY KEY, school_id uuid NOT NULL);
CREATE TABLE public.school_memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL, user_id uuid NOT NULL, status text NOT NULL);
GRANT USAGE ON SCHEMA public, private, auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);
const mig = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8");
await db.exec(mig("20261002062355_chat_conversations.sql"));
const fix = mig("20261002100000_chat_integrity.sql");
await db.exec(fix);
await db.exec(fix);

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const ana = "00000000-0000-0000-0000-000000000001";
const rui = "00000000-0000-0000-0000-000000000002";
const exFunc = "00000000-0000-0000-0000-000000000003";
const conv = "00000000-0000-0000-0000-0000000000c1";
const fileA = "00000000-0000-0000-0000-0000000000f1";
const fileB = "00000000-0000-0000-0000-0000000000f2";
await db.exec(`
INSERT INTO auth.users VALUES ('${ana}'),('${rui}'),('${exFunc}');
INSERT INTO schools VALUES ('${A}'),('${B}');
INSERT INTO siga_files VALUES ('${fileA}','${A}'),('${fileB}','${B}');
INSERT INTO school_memberships(school_id,user_id,status) VALUES
  ('${A}','${ana}','active'),('${A}','${rui}','active'),('${A}','${exFunc}','revoked');
INSERT INTO siga_chat_conversations(id,school_id,created_by) VALUES ('${conv}','${A}','${ana}');
INSERT INTO siga_chat_members(conversation_id,user_id) VALUES ('${conv}','${ana}'),('${conv}','${rui}'),('${conv}','${exFunc}');
`);

async function as(user, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("SET ROLE authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("RESET ROLE");
  }
}
const send = (user, school, extra = {}) =>
  as(
    user,
    `insert into siga_chat_messages(conversation_id,school_id,sender_id,body,attachment_file_id,reply_to)
     values ($1,$2,$3,'olá',$4,$5) returning id`,
    [conv, school, user, extra.file ?? null, extra.reply ?? null],
  );

// Caminho normal: membro activo envia, com anexo da escola.
const ok = await send(ana, A, { file: fileA });
assert.equal(ok.rows.length, 1);
// 1. Escola trocada e anexo de outra escola.
await assert.rejects(send(ana, B), /escola da conversa/);
await assert.rejects(send(ana, A, { file: fileB }), /ficheiro da escola/);
// 2. Resposta: mesma conversa aceite; outra conversa recusada.
await send(rui, A, { reply: ok.rows[0].id });
await db.exec(`INSERT INTO siga_chat_conversations(id,school_id) VALUES ('00000000-0000-0000-0000-0000000000c2','${A}');
  INSERT INTO siga_chat_messages(id,conversation_id,school_id,sender_id,body)
  VALUES ('00000000-0000-0000-0000-0000000000e9','00000000-0000-0000-0000-0000000000c2','${A}','${ana}','x');`);
await assert.rejects(
  send(ana, A, { reply: "00000000-0000-0000-0000-0000000000e9" }),
  /mesma conversa/,
);
// 3. Ex-funcionário (vínculo revogado) já não lê nem escreve.
assert.equal((await as(exFunc, "select count(*)::int n from siga_chat_messages")).rows[0].n, 0);
await assert.rejects(send(exFunc, A), /row-level security/);
assert.equal(
  (await as(rui, "select count(*)::int n from siga_chat_messages where conversation_id=$1", [conv]))
    .rows[0].n,
  2,
);
// Apagar quem criou a conversa já não é bloqueado.
await db.exec(
  `DELETE FROM siga_chat_members WHERE user_id='${ana}'; DELETE FROM siga_chat_messages WHERE sender_id='${ana}'; DELETE FROM auth.users WHERE id='${ana}'`,
);
assert.equal(
  (await db.query(`select created_by from siga_chat_conversations where id='${conv}'`)).rows[0]
    .created_by,
  null,
);

console.log("chat-integrity: todas as verificações passaram");
