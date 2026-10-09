import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";
const manifest = JSON.parse(await readFile("dist/manifest.webmanifest", "utf8"));
assert.equal(manifest.display, "standalone");
assert.equal(manifest.scope, "./");
for (const icon of manifest.icons) await access("dist/" + icon.src.replace("./", ""));
const listeners = new Map();
const scope = "https://example.test/mobile-v4/";
vm.runInNewContext(await readFile("dist/sw.js", "utf8"), {
  URL,
  self: {
    registration: { scope },
    location: { origin: "https://example.test" },
    addEventListener: (name, fn) => listeners.set(name, fn),
  },
});
const handles = (request) => {
  let intercepted = false;
  listeners.get("fetch")({
    request,
    respondWith: () => {
      intercepted = true;
    },
  });
  return intercepted;
};
assert.equal(handles({ method: "POST", url: scope + "commands" }), false);
assert.equal(
  handles({ method: "GET", url: "https://example.test/api/mobile-v4/session", mode: "cors" }),
  false,
);
assert.equal(handles({ method: "GET", url: scope + "api/grades", mode: "cors" }), false);
assert.equal(
  handles({ method: "GET", url: "https://other.test/index.html", mode: "navigate" }),
  false,
);
assert.ok(listeners.has("install"));
assert.ok(listeners.has("activate"));
console.log(
  "PWA verified: manifest/icons, scope, API exclusion, POST exclusion, external-origin exclusion.",
);
