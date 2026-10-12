// Actual staged RPC + actual Sga chat guard in isolated PostgreSQL. Never connects to production.
// Does not establish PostgREST/Auth/MFA/concurrent transaction or real-account E2E behavior.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.SIGA_SQL_TEST_MODULE_PATH || "@electric-sql/pglite");
const pg = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let checks = 0;
const sql = await readFile(
  new URL(
    "../../mobile-v4/staging/database/supabase/migrations/20261010083336_mobile_v4_chat_commands.sql",
    import.meta.url,
  ),
  "utf8",
);
await pg.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA private;
CREATE TABLE school_memberships(id uuid PRIMARY KEY,school_id uuid,user_id uuid,status text);
CREATE TABLE member_roles(membership_id uuid,role_id uuid); CREATE TABLE roles(id uuid PRIMARY KEY,code text);
CREATE TABLE siga_chat_conversations(id uuid PRIMARY KEY,school_id uuid,type text,title text,direct_key text UNIQUE,created_by uuid);
CREATE TABLE siga_chat_members(conversation_id uuid,user_id uuid,last_read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(conversation_id,user_id));
CREATE TABLE siga_chat_messages(id uuid PRIMARY KEY,school_id uuid NOT NULL,conversation_id uuid NOT NULL,sender_id uuid NOT NULL,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,reply_to uuid,attachment_file_id uuid,attachment_file_name text);
CREATE TABLE siga_files(id uuid PRIMARY KEY,school_id uuid);
CREATE TABLE audit_logs(school_id uuid,actor_user_id uuid,action text,entity_type text,entity_id text,request_id text,metadata jsonb);
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO roles VALUES('${id(10)}','student'),('${id(11)}','teacher');
INSERT INTO school_memberships VALUES('${id(20)}','${id(1)}','${id(2)}','active'),('${id(21)}','${id(1)}','${id(3)}','active'),('${id(22)}','${id(1)}','${id(4)}','active'),('${id(23)}','${id(9)}','${id(5)}','active');
INSERT INTO member_roles VALUES('${id(20)}','${id(10)}'),('${id(21)}','${id(11)}'),('${id(22)}','${id(10)}'),('${id(23)}','${id(11)}');
`);
const guard = await readFile(
  new URL("../../supabase/migrations/20261002100000_chat_integrity.sql", import.meta.url),
  "utf8",
);
await pg.exec(
  guard.slice(
    guard.indexOf("CREATE OR REPLACE FUNCTION private.siga_chat_message_guard"),
    guard.indexOf("-- 3:"),
  ),
);
await pg.exec(sql);
await pg.exec(sql);
checks++;
const invoke = async (command, request = 100, actor = 2, school = 1, role = "aluno") =>
  (
    await pg.query("SELECT public.mobile_v4_chat_command($1,$2,$3,$4,$5) AS result", [
      id(school),
      id(actor),
      role,
      id(request),
      command,
    ])
  ).rows[0].result;
const count = async (table) =>
  (await pg.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
const rejects = async (p, code) => {
  await assert.rejects(p, (e) => e.message.includes(code));
  checks++;
};
try {
  for (const role of ["anon", "authenticated"]) {
    await pg.exec(`SET ROLE ${role}`);
    await rejects(invoke({ type: "start", peerId: id(3) }), "permission denied");
    await rejects(pg.query("SELECT * FROM mobile_v4_chat_requests"), "permission denied");
    await pg.exec("RESET ROLE");
  }
  await pg.exec("SET ROLE service_role");
  await rejects(invoke({ type: "start", peerId: id(4) }), "CHAT_FORBIDDEN");
  await rejects(invoke({ type: "start", peerId: id(5) }), "CHAT_FORBIDDEN");
  await rejects(invoke({ type: "start", peerId: id(2) }), "CHAT_FORBIDDEN");
  await rejects(invoke({ type: "start", peerId: id(3) }, 100, 2, 1, "professor"), "CHAT_FORBIDDEN");
  const thread = await invoke({ type: "start", peerId: id(3) });
  assert.ok(thread.conversationId);
  checks++;
  const same = await invoke({ type: "start", peerId: id(3) }, 101);
  assert.equal(same.conversationId, thread.conversationId);
  assert.equal(await count("siga_chat_conversations"), 1);
  checks++;
  const sent = await invoke(
    { type: "send", conversationId: thread.conversationId, body: "Mensagem real de teste" },
    102,
  );
  assert.equal(await count("siga_chat_messages"), 1);
  checks++;
  assert.deepEqual(
    await invoke(
      { type: "send", conversationId: thread.conversationId, body: "Mensagem real de teste" },
      102,
    ),
    sent,
  );
  assert.equal(await count("siga_chat_messages"), 1);
  assert.equal(await count("audit_logs"), 3);
  checks++;
  await rejects(
    invoke({ type: "send", conversationId: thread.conversationId, body: "Outro conteúdo" }, 102),
    "IDEMPOTENCY_CONFLICT",
  );
  await rejects(
    invoke(
      { type: "send", conversationId: thread.conversationId, body: "Mensagem", replyTo: id(999) },
      103,
    ),
    "CHAT_FORBIDDEN",
  );
  await rejects(
    invoke({ type: "send", conversationId: thread.conversationId, body: "Mensagem" }, 103, 4),
    "CHAT_FORBIDDEN",
  );
  await rejects(
    invoke(
      { type: "send", conversationId: thread.conversationId, body: " ", attachmentFileId: id(999) },
      103,
    ),
    "CHAT_VALIDATION_FAILED",
  );
  const reply = await invoke(
    {
      type: "send",
      conversationId: thread.conversationId,
      body: "Resposta",
      replyTo: sent.messageId,
    },
    103,
    3,
    1,
    "professor",
  );
  assert.equal(
    (await pg.query("SELECT reply_to FROM siga_chat_messages WHERE id=$1", [reply.messageId]))
      .rows[0].reply_to,
    sent.messageId,
  );
  checks++;
  await rejects(
    invoke(
      { type: "delete", conversationId: thread.conversationId, messageId: sent.messageId },
      104,
      3,
      1,
      "professor",
    ),
    "CHAT_FORBIDDEN",
  );
  await invoke(
    { type: "delete", conversationId: thread.conversationId, messageId: sent.messageId },
    104,
  );
  const deleted = (await pg.query("SELECT * FROM siga_chat_messages WHERE id=$1", [sent.messageId]))
    .rows[0];
  assert.equal(deleted.body, "");
  assert.ok(deleted.deleted_at);
  checks++;
  await pg.query(
    "UPDATE siga_chat_members SET last_read_at='2020-01-01' WHERE conversation_id=$1 AND user_id=$2",
    [thread.conversationId, id(2)],
  );
  await invoke(
    { type: "read", conversationId: thread.conversationId, messageId: reply.messageId },
    105,
  );
  const readAt = (
    await pg.query(
      "SELECT last_read_at FROM siga_chat_members WHERE conversation_id=$1 AND user_id=$2",
      [thread.conversationId, id(2)],
    )
  ).rows[0].last_read_at;
  assert.ok(new Date(readAt) > new Date("2020-01-01"));
  checks++;
  // Force audit failure after INSERT: message, receipt and audit must all roll back.
  await pg.exec("RESET ROLE");
  await pg.exec(
    "ALTER TABLE audit_logs ADD CONSTRAINT no_send CHECK(action<>'mobile_v4.chat.send') NOT VALID",
  );
  await pg.exec("SET ROLE service_role");
  const before = await count("siga_chat_messages"),
    beforeKeys = await count("mobile_v4_chat_requests");
  await rejects(
    invoke({ type: "send", conversationId: thread.conversationId, body: "Rollback" }, 106),
    "no_send",
  );
  assert.equal(await count("siga_chat_messages"), before);
  assert.equal(await count("mobile_v4_chat_requests"), beforeKeys);
  checks++;
  await pg.exec("RESET ROLE");
  await pg.exec("ALTER TABLE audit_logs DROP CONSTRAINT no_send");
  await pg.exec("SET ROLE service_role");
  await pg.query("UPDATE school_memberships SET status='inactive' WHERE user_id=$1", [id(3)]);
  await rejects(
    invoke({ type: "send", conversationId: thread.conversationId, body: "Peer saiu" }, 106),
    "CHAT_FORBIDDEN",
  );
  await pg.query("UPDATE school_memberships SET status='inactive' WHERE user_id=$1", [id(2)]);
  await rejects(
    invoke(
      { type: "send", conversationId: thread.conversationId, body: "Mensagem real de teste" },
      102,
    ),
    "CHAT_FORBIDDEN",
  );
  assert.ok(
    !(await pg.query("SELECT metadata::text FROM audit_logs")).rows.some((r) =>
      r.metadata.includes("Mensagem real"),
    ),
  );
  checks++;
  console.log(
    `Mobile V4 chat commands: ${checks} isolated PostgreSQL checks passed (no production access).`,
  );
} finally {
  await pg.close();
}
