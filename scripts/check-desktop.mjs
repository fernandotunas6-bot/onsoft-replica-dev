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
assert.equal(config.app.withGlobalTauri, true);
const local = readJson("src-tauri/capabilities/default.json");
assert.deepEqual(local.permissions, [
  "core:default",
  "allow-get-system-info",
  "allow-get-desktop-diagnostics",
  "allow-open-school-portal",
]);
// Updater registado sem `plugins.updater` (chave pública) faz a app terminar ao abrir.
const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
for (const match of lib.matchAll(/tauri_plugin_updater::Builder/g)) {
  const before = lib.slice(Math.max(0, match.index - 200), match.index);
  assert(
    before.includes("if updater_configured("),
    "O updater só pode ser registado depois de verificar plugins.updater (updater_configured)",
  );
}
assert.deepEqual(readJson("src-tauri/tauri.windows.conf.json").bundle.targets, ["nsis"]);
assert.equal(config.bundle.windows.nsis.installMode, "currentUser");
assert.equal(config.bundle.windows.allowDowngrades, false);
assert(existsSync("src-tauri/Cargo.lock"));
if (process.env.GITHUB_REF_TYPE === "tag")
  assert.equal(
    process.env.GITHUB_REF_NAME,
    `v${config.version}`,
    "Release tag must match application version",
  );
console.log("Desktop launcher, production origin, CSP, lockfile and versions verified.");
