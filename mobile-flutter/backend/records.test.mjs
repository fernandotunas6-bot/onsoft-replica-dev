import test from "node:test";
import assert from "node:assert/strict";
import { handleRecords } from "./records.ts";

const school = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";
const id = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;

function req(collection, { role = "aluno", headers = {}, method = "GET", query } = {}) {
  const search = query ?? `?role=${role}`;
  return new Request(
    `https://test.example/api/mobile-v4/schools/${school}/${collection}${search}`,
    { method, headers: { Authorization: "Bearer token", ...headers } },
  );
}
const notice = (overrides = {}) => ({
  id: id(2),
  title: "Reunião de encarregados",
  body: "Sábado às 9h no pavilhão.",
  publishedAt: "2026-10-15T08:00:00Z",
  category: "Geral",
  read: false,
  authorUserId: "privado",
  recipients: ["privado"],
  ...overrides,
});
const result = (overrides = {}) => ({
  id: id(3),
  classSubjectId: id(4),
  subjectName: "Matemática",
  termName: "I Trimestre",
  kind: "Prova do professor",
  status: "published",
  value: 14,
  scaleMax: 20,
  publishedAt: "2026-10-10T10:00:00Z",
  internalNote: "privado",
  ...overrides,
});
function deps(overrides = {}) {
  return {
    authenticate: async () => ({ userId: "verified", aal: "aal1" }),
    notices: async (_user, scope) => ({ ...scope, items: [notice()], nextCursor: null }),
    results: async (_user, scope) => ({ ...scope, items: [result()] }),
    ...overrides,
  };
}

test("notices travel with an allowlist and the scope", async () => {
  const response = await handleRecords(req("notices"), deps());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.version, 1);
  assert.equal(body.schoolId, school);
  assert.equal(body.role, "aluno");
  assert.deepEqual(Object.keys(body.items[0]).sort(), [
    "body",
    "category",
    "id",
    "publishedAt",
    "read",
    "title",
  ]);
  const text = JSON.stringify(body);
  assert.ok(!text.includes("privado"));
});

test("a pending result never travels with a value or a scale", async () => {
  const response = await handleRecords(
    req("results"),
    deps({
      results: async (_user, scope) => ({
        ...scope,
        items: [result({ status: "pending", value: 9, scaleMax: 20 })],
      }),
    }),
  );
  const [item] = (await response.json()).items;
  assert.equal(item.status, "pending");
  assert.equal(item.value, null);
  assert.equal(item.scaleMax, null);
  assert.equal(item.publishedAt, null);
});

test("a published result without a usable scale is a service failure", async () => {
  for (const broken of [
    { scaleMax: null },
    { scaleMax: 0 },
    { value: null },
    { value: 21, scaleMax: 20 },
    { value: -1 },
    { publishedAt: "ontem" },
  ]) {
    const response = await handleRecords(
      req("results"),
      deps({
        results: async (_user, scope) => ({ ...scope, items: [result(broken)] }),
      }),
    );
    assert.equal(response.status, 503, JSON.stringify(broken));
    assert.deepEqual(await response.json(), { error: "RESULTS_INVALID" });
  }
});

test("a reply from another school or role is refused", async () => {
  const foreignSchool = await handleRecords(
    req("notices"),
    deps({
      notices: async () => ({ schoolId: other, role: "aluno", items: [] }),
    }),
  );
  assert.equal(foreignSchool.status, 503);
  const foreignRole = await handleRecords(
    req("results"),
    deps({
      results: async () => ({ schoolId: school, role: "professor", items: [] }),
    }),
  );
  assert.equal(foreignRole.status, 503);
});

test("a read failure does not become an empty feed", async () => {
  for (const broken of [
    async () => ({ schoolId: school, role: "aluno" }),
    async () => null,
    async () => {
      throw new Error("select * from notifications");
    },
  ]) {
    const response = await handleRecords(req("notices"), deps({ notices: broken }));
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("notifications"));
  }
});

test("a repeated or malformed notice is refused", async () => {
  const cases = [
    [notice(), notice()],
    [notice({ id: "not-a-uuid" })],
    [notice({ title: "" })],
    [notice({ publishedAt: "logo" })],
    [notice({ body: 42 })],
    [notice({ read: "sim" })],
  ];
  for (const items of cases) {
    const response = await handleRecords(
      req("notices"),
      deps({ notices: async (_user, scope) => ({ ...scope, items }) }),
    );
    assert.equal(response.status, 503, JSON.stringify(items));
  }
});

test("more pages are declared instead of silently truncated", async () => {
  const response = await handleRecords(
    req("notices"),
    deps({
      notices: async (_user, scope) => ({
        ...scope,
        items: [notice()],
        nextCursor: "cursor-opaco",
      }),
    }),
  );
  assert.equal((await response.json()).nextCursor, "cursor-opaco");
});

test("session, scope, method, origin and query are guarded", async () => {
  const anonymous = await handleRecords(
    new Request(`https://test.example/api/mobile-v4/schools/${school}/notices?role=aluno`),
    deps(),
  );
  assert.equal(anonymous.status, 401);
  const rejected = await handleRecords(
    req("notices"),
    deps({
      authenticate: async () => {
        throw new Error("expired");
      },
    }),
  );
  assert.equal(rejected.status, 401);
  const badRole = await handleRecords(
    req("notices", { query: "?role=encarregado" }),
    deps(),
  );
  assert.equal(badRole.status, 422);
  const extraQuery = await handleRecords(
    req("notices", { query: "?role=aluno&page=2" }),
    deps(),
  );
  assert.equal(extraQuery.status, 422);
  const duplicated = await handleRecords(
    req("notices", { query: "?role=aluno&role=professor" }),
    deps(),
  );
  assert.equal(duplicated.status, 422);
  const written = await handleRecords(req("notices", { method: "POST" }), deps());
  assert.equal(written.status, 405);
  assert.equal(written.headers.get("Allow"), "GET");
  const foreign = await handleRecords(
    req("notices", { headers: { Origin: "https://attacker.example" } }),
    deps(),
  );
  assert.equal(foreign.status, 403);
  const unknown = await handleRecords(
    new Request(`https://test.example/api/mobile-v4/schools/${school}/grades?role=aluno`, {
      headers: { Authorization: "Bearer token" },
    }),
    deps(),
  );
  assert.equal(unknown.status, 404);
});

test("the reader's own id travels, so the client can discard a stale reply", async () => {
  const body = await (await handleRecords(req("results"), deps())).json();
  assert.equal(body.userId, "verified");
  assert.equal(
    (await (await handleRecords(req("results"), deps())).json()).items[0].value,
    14,
  );
});
