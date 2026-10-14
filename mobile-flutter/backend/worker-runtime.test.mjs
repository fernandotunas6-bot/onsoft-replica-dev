import test from "node:test";
import assert from "node:assert/strict";
import { routeMobileRequest } from "./worker-runtime.ts";
function harness() {
  const calls = [];
  const h = Object.fromEntries(
    ["canonical", "extension", "assets"].map((name) => [
      name,
      async () => {
        calls.push(name);
        return new Response(name, {
          headers: { "Cache-Control": "public", "Set-Cookie": "secret=1" },
        });
      },
    ]),
  );
  return { calls, h };
}
const req = (path, headers = {}) => new Request("https://school.test" + path, { headers });
test("classes and tasks route through extension, not static fallback", async () => {
  for (const path of [
    "/api/mobile-v4/schools/id/classes",
    "/api/mobile-v4/schools/id/tasks/task",
  ]) {
    const { calls, h } = harness();
    await routeMobileRequest(req(path), h);
    assert.deepEqual(calls, ["extension"]);
  }
});
test("canonical API uses preserved backend", async () => {
  const { calls, h } = harness();
  await routeMobileRequest(req("/api/mobile-v4/session"), h);
  assert.deepEqual(calls, ["canonical"]);
});
test("unknown API never serves Flutter HTML", async () => {
  const { calls, h } = harness();
  assert.equal((await routeMobileRequest(req("/api/unknown"), h)).status, 404);
  assert.deepEqual(calls, []);
});
test("assets use only asset service", async () => {
  const { calls, h } = harness();
  await routeMobileRequest(req("/flutter_bootstrap.js"), h);
  assert.deepEqual(calls, ["assets"]);
});
test("cross-site request refused before any backend call", async () => {
  const { calls, h } = harness();
  assert.equal(
    (await routeMobileRequest(req("/api/mobile-v4/session", { Origin: "https://evil.test" }), h))
      .status,
    403,
  );
  assert.deepEqual(calls, []);
});
test("API response is private and does not forward cookies", async () => {
  const { h } = harness();
  const r = await routeMobileRequest(req("/api/mobile-v4/session"), h);
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  assert.equal(r.headers.get("Set-Cookie"), null);
});
test("unexpected backend exception does not expose details", async () => {
  const { h } = harness();
  h.canonical = async () => {
    throw Error("database-secret");
  };
  const r = await routeMobileRequest(req("/api/mobile-v4/session"), h);
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes("database-secret"));
});
