import assert from "node:assert/strict";
import test from "node:test";
import worker from "./domain-worker.mjs";
const env = {
  PUBLIC_ORIGIN: "https://m.portal-siga.com",
  PAGES_ORIGIN: "https://c734a903.siga-plus-mobile-v4.pages.dev",
};
test("domain proxy security and forwarding", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (request) => {
    calls++;
    assert.equal(request.url, env.PAGES_ORIGIN + "/api/mobile-v4/session?x=1");
    assert.equal(request.headers.get("Origin"), env.PAGES_ORIGIN);
    assert.equal(request.headers.get("Authorization"), "Bearer test");
    assert.equal(request.headers.get("Cookie"), null);
    assert.equal(request.headers.get("X-Forwarded-Host"), null);
    assert.equal(request.redirect, "manual");
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  };
  try {
    for (const origin of ["https://evil.example", "null", "https://portal-siga.com"]) {
      assert.equal(
        (
          await worker.fetch(
            new Request(env.PUBLIC_ORIGIN + "/api/mobile-v4/session", {
              headers: { Origin: origin },
            }),
            env,
          )
        ).status,
        403,
      );
    }
    assert.equal((await worker.fetch(new Request("https://other.example/"), env)).status, 421);
    assert.equal(
      (
        await worker.fetch(
          new Request(env.PUBLIC_ORIGIN + "/api/mobile-v4/session", {
            headers: { "Sec-Fetch-Site": "cross-site" },
          }),
          env,
        )
      ).status,
      403,
    );
    assert.equal(calls, 0);
    const result = await worker.fetch(
      new Request(env.PUBLIC_ORIGIN + "/api/mobile-v4/session?x=1", {
        headers: {
          Origin: env.PUBLIC_ORIGIN,
          Authorization: "Bearer test",
          Cookie: "parent=secret",
          "X-Forwarded-Host": "evil.example",
        },
      }),
      env,
    );
    assert.equal(result.status, 401);
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example/", "Set-Cookie": "secret=yes" },
      });
    assert.equal((await worker.fetch(new Request(env.PUBLIC_ORIGIN), env)).status, 502);
    globalThis.fetch = async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "/login", "Set-Cookie": "secret=yes" },
      });
    const redirect = await worker.fetch(new Request(env.PUBLIC_ORIGIN), env);
    assert.equal(redirect.headers.get("Location"), env.PUBLIC_ORIGIN + "/login");
    assert.equal(redirect.headers.get("Set-Cookie"), null);
    globalThis.fetch = async () => {
      throw new Error("network");
    };
    assert.equal((await worker.fetch(new Request(env.PUBLIC_ORIGIN), env)).status, 502);
  } finally {
    globalThis.fetch = original;
  }
});
