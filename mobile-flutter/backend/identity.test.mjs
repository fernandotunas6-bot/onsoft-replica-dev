import test from "node:test";
import assert from "node:assert/strict";
import { handleIdentitySignIn } from "./identity.ts";

const endpoint = "https://test.example/api/mobile-v4/auth/identifier";
function req(body, { method = "POST", headers = {}, raw } = {}) {
  return new Request(endpoint, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}
function deps(overrides = {}) {
  return {
    resolveEmail: async () => "aluno@escola.ao",
    passwordGrant: async () => ({
      ok: true,
      accessToken: "access",
      refreshToken: "refresh",
    }),
    consumeRateLimit: async () => true,
    clientIp: () => "203.0.113.7",
    ...overrides,
  };
}
const credentials = { identifier: "003456789LA042", password: "senha-correcta" };

test("returns only the session envelope", async () => {
  const response = await handleIdentitySignIn(req(credentials), deps());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), [
    "accessToken",
    "refreshToken",
    "version",
  ]);
  assert.equal(body.version, 1);
});

test("the resolved e-mail never reaches the device", async () => {
  const response = await handleIdentitySignIn(
    req(credentials),
    deps({ resolveEmail: async () => "pessoa.privada@escola.ao" }),
  );
  const text = await response.text();
  assert.ok(!text.includes("pessoa.privada"));
  assert.ok(!text.includes("@"));
});

test("an unknown identifier answers like a wrong password", async () => {
  const unknown = await handleIdentitySignIn(
    req(credentials),
    deps({ resolveEmail: async () => "003456789LA042" }),
  );
  const wrong = await handleIdentitySignIn(
    req(credentials),
    deps({ passwordGrant: async () => ({ ok: false, error: "invalid_credentials" }) }),
  );
  assert.equal(unknown.status, wrong.status);
  assert.deepEqual(await unknown.json(), await wrong.json());
});

test("a captcha refusal is not reported as bad credentials", async () => {
  const response = await handleIdentitySignIn(
    req(credentials),
    deps({ passwordGrant: async () => ({ ok: false, error: "captcha_failed" }) }),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "CAPTCHA_REQUIRED" });
});

test("the signal travels to the grant when sent", async () => {
  let seen = "absent";
  await handleIdentitySignIn(
    req({ ...credentials, captchaToken: "sinal" }),
    deps({
      passwordGrant: async (_email, _password, captchaToken) => {
        seen = captchaToken;
        return { ok: true, accessToken: "a", refreshToken: "r" };
      },
    }),
  );
  assert.equal(seen, "sinal");
});

test("charges the limit per address and per account", async () => {
  const keys = [];
  await handleIdentitySignIn(
    req(credentials),
    deps({
      consumeRateLimit: async (key) => {
        keys.push(key);
        return true;
      },
    }),
  );
  assert.deepEqual(keys, [
    "bi_lookup:203.0.113.7",
    "bi_login_identifier:003456789la042",
  ]);
});

test("a spent address allowance stops before the resolver", async () => {
  let resolved = 0;
  const response = await handleIdentitySignIn(
    req(credentials),
    deps({
      consumeRateLimit: async () => false,
      resolveEmail: async () => {
        resolved++;
        return "aluno@escola.ao";
      },
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(resolved, 0);
});

test("refuses other methods, origins and media types", async () => {
  const get = await handleIdentitySignIn(
    new Request(endpoint, { method: "GET" }),
    deps(),
  );
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("Allow"), "POST");
  const foreign = await handleIdentitySignIn(
    req(credentials, { headers: { Origin: "https://attacker.example" } }),
    deps(),
  );
  assert.equal(foreign.status, 403);
  const crossSite = await handleIdentitySignIn(
    req(credentials, { headers: { "Sec-Fetch-Site": "cross-site" } }),
    deps(),
  );
  assert.equal(crossSite.status, 403);
  const form = await handleIdentitySignIn(
    req(credentials, { headers: { "Content-Type": "text/plain" } }),
    deps(),
  );
  assert.equal(form.status, 415);
  const other = await handleIdentitySignIn(
    new Request("https://test.example/api/mobile-v4/auth/other", { method: "POST" }),
    deps(),
  );
  assert.equal(other.status, 404);
});

test("refuses malformed and unexpected input without calling Auth", async () => {
  let grants = 0;
  const watch = deps({
    passwordGrant: async () => {
      grants++;
      return { ok: true, accessToken: "a", refreshToken: "r" };
    },
  });
  const cases = [
    req(undefined, { raw: "{" }),
    req([credentials]),
    req({ ...credentials, role: "administrador" }),
    req({ identifier: "ab", password: "senha" }),
    req({ identifier: "003456789LA042", password: "" }),
    req({ identifier: "003456789LA042", password: "x".repeat(201) }),
    req({ ...credentials, captchaToken: 42 }),
    req({ ...credentials, captchaToken: "x".repeat(4001) }),
  ];
  for (const request of cases) {
    const response = await handleIdentitySignIn(request, watch);
    assert.equal(response.status, 422, await response.text());
  }
  assert.equal(grants, 0);
});

test("an incomplete grant is a service failure, never a session", async () => {
  for (const grant of [
    { ok: true, accessToken: "access" },
    { ok: true, accessToken: "", refreshToken: "refresh" },
    null,
  ]) {
    const response = await handleIdentitySignIn(
      req(credentials),
      deps({ passwordGrant: async () => grant }),
    );
    assert.equal(response.status, 503);
  }
});

test("a resolver failure does not leak its reason", async () => {
  const response = await handleIdentitySignIn(
    req(credentials),
    deps({
      resolveEmail: async () => {
        throw new Error('select "email" from people where national_id = ...');
      },
    }),
  );
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.ok(!text.includes("people"));
  assert.deepEqual(JSON.parse(text), { error: "SERVICE_UNAVAILABLE" });
});
