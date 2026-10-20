import assert from "node:assert/strict";
const { default: worker } = await import("../build/worker-check/_worker.js");
let assetReads = 0;
const env = {
  ASSETS: {
    fetch: async () => {
      assetReads++;
      return new Response("asset");
    },
  },
};
const origin = "https://worker-validation.example";
for (const [path, status, headers] of [
  ["/api/mobile-v4/session", 401, {}],
  ["/api/unknown", 404, {}],
  ["/api/mobile-v4/session", 403, { Origin: "https://external.example" }],
]) {
  const response = await worker.fetch(new Request(origin + path, { headers }), env);
  assert.equal(response.status, status, path);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
}
assert.equal(assetReads, 0);
assert.equal(
  await (await worker.fetch(new Request(origin + "/flutter_bootstrap.js"), env)).text(),
  "asset",
);
assert.equal(assetReads, 1);
console.log(
  "Compiled Worker smoke checks passed: session refusal, origin, API 404 and assets. No account/database/provider operation performed.",
);
