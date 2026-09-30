import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const config = readJson("src-tauri/tauri.conf.json");
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
assert.equal(
  config.version,
  cargo.match(/^version = "([^"]+)"/m)[1],
  "Cargo and Tauri versions differ",
);
assert.equal(config.build.frontendDist, "../desktop");
for (const file of ["index.html", "launcher.js", "launcher.css"])
  assert(existsSync(`desktop/${file}`), `Missing desktop/${file}`);
assert(config.app.security.csp && !config.app.security.csp.includes("unsafe-"));
const remote = readJson("src-tauri/capabilities/school-portal.json");
assert.deepEqual(remote.remote.urls, ["https://portal-siga.com/*"]);
assert.equal(remote.local, false);
assert(
  !remote.permissions.some((permission) =>
    /^(shell|fs|store|updater|process|stronghold|opener):/.test(permission),
  ),
);
assert(existsSync("src-tauri/Cargo.lock"));
if (process.env.GITHUB_REF_TYPE === "tag")
  assert.equal(
    process.env.GITHUB_REF_NAME,
    `v${config.version}`,
    "Release tag must match application version",
  );
console.log("Desktop launcher, production origin, CSP, lockfile and versions verified.");
