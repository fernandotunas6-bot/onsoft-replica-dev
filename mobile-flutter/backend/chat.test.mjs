import test from "node:test";
import assert from "node:assert/strict";
import { handleChatHistory } from "./chat.ts";

const school = "11111111-1111-4111-8111-111111111111";
const thread = "22222222-2222-4222-8222-222222222222";
const message = "33333333-3333-4333-8333-333333333333";

function req({ role = "aluno", id = thread, headers = {}, method = "GET", query } = {}) {
  const search = query ?? `?role=${role}`;
  return new Request(
    `https://test.example/api/mobile-v4/schools/${school}/chat/threads/${id}${search}`,
    { method, headers: { Authorization: "Bearer token", ...headers } },
  );
}
const history = (overrides = {}) => ({
  schoolId: school,
  role: "aluno",
  threadId: thread,
  threadName: "Direcção de turma",
  messages: [
    {
      id: message,
      authorName: "Direcção",
      mine: false,
      body: "Bom dia.",
      sentAt: "2026-10-16T07:30:00Z",
      attachments: [{ name: "circular.pdf", bytes: 1024, url: "https://privado" }],
      authorUserId: "privado",
      authorEmail: "privado@escola.ao",
      storagePath: "privado/circular.pdf",
    },
  ],
  previousCursor: null,
  ...overrides,
});
function deps(overrides = {}) {
  return {
    authenticate: async () => ({ userId: "verified", aal: "aal1" }),
    history: async () => history(),
    ...overrides,
  };
}

test("history travels with an allowlist and no storage links", async () => {
  const response = await handleChatHistory(req(), deps());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.version, 1);
  assert.equal(body.threadName, "Direcção de turma");
  assert.deepEqual(Object.keys(body.messages[0]).sort(), [
    "attachments",
    "authorName",
    "body",
    "id",
    "mine",
    "sentAt",
  ]);
  assert.deepEqual(body.messages[0].attachments, [
    { name: "circular.pdf", bytes: 1024 },
  ]);
  const text = JSON.stringify(body);
  assert.ok(!text.includes("privado"));
  assert.ok(!text.includes("https://"));
});

test("an unauthorized thread answers like an absent one", async () => {
  const absent = await handleChatHistory(req(), deps({ history: async () => null }));
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), { error: "THREAD_NOT_AVAILABLE" });
});

test("a reply about another thread or school is refused", async () => {
  for (const broken of [
    { threadId: "44444444-4444-4444-8444-444444444444" },
    { schoolId: "55555555-5555-4555-8555-555555555555" },
    { role: "professor" },
    { threadName: "" },
  ]) {
    const response = await handleChatHistory(
      req(),
      deps({ history: async () => history(broken) }),
    );
    assert.equal(response.status, 503, JSON.stringify(broken));
    assert.deepEqual(await response.json(), { error: "HISTORY_INVALID" });
  }
});

test("a malformed message is refused, not shown half-read", async () => {
  for (const messages of [
    [{ ...history().messages[0], id: "x" }],
    [{ ...history().messages[0], mine: "sim" }],
    [{ ...history().messages[0], sentAt: "ontem" }],
    [{ ...history().messages[0], authorName: "" }],
    [{ ...history().messages[0], attachments: [{ name: "a", bytes: -1 }] }],
    [{ ...history().messages[0], attachments: "circular.pdf" }],
    [history().messages[0], history().messages[0]],
  ]) {
    const response = await handleChatHistory(
      req(),
      deps({ history: async () => history({ messages }) }),
    );
    assert.equal(response.status, 503, JSON.stringify(messages));
  }
});

test("a read failure does not become an empty conversation", async () => {
  const response = await handleChatHistory(
    req(),
    deps({
      history: async () => {
        throw new Error("select * from chat_messages");
      },
    }),
  );
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.ok(!text.includes("chat_messages"));
  assert.deepEqual(JSON.parse(text), { error: "HISTORY_UNAVAILABLE" });
});

test("session, thread, method, origin and query are guarded", async () => {
  const anonymous = await handleChatHistory(
    new Request(
      `https://test.example/api/mobile-v4/schools/${school}/chat/threads/${thread}?role=aluno`,
    ),
    deps(),
  );
  assert.equal(anonymous.status, 401);
  const badThread = await handleChatHistory(req({ id: "conversa-1" }), deps());
  assert.equal(badThread.status, 422);
  const badRole = await handleChatHistory(req({ query: "?role=encarregado" }), deps());
  assert.equal(badRole.status, 422);
  const extra = await handleChatHistory(req({ query: "?role=aluno&cursor=x" }), deps());
  assert.equal(extra.status, 422);
  const written = await handleChatHistory(req({ method: "POST" }), deps());
  assert.equal(written.status, 405);
  assert.equal(written.headers.get("Allow"), "GET");
  const foreign = await handleChatHistory(
    req({ headers: { Origin: "https://attacker.example" } }),
    deps(),
  );
  assert.equal(foreign.status, 403);
  const other = await handleChatHistory(
    new Request(`https://test.example/api/mobile-v4/schools/${school}/chat/threads`, {
      headers: { Authorization: "Bearer token" },
    }),
    deps(),
  );
  assert.equal(other.status, 404);
});

test("an older page is declared instead of silently dropped", async () => {
  const response = await handleChatHistory(
    req(),
    deps({ history: async () => history({ previousCursor: "cursor-opaco" }) }),
  );
  assert.equal((await response.json()).previousCursor, "cursor-opaco");
});
