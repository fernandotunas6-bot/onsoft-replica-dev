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
const html = readFileSync("desktop/index.html", "utf8");
assert(
  html.includes(`name="siga-version" content="${config.version}"`),
  "Launcher version differs from Tauri",
);
assert.equal(config.app.withGlobalTauri, true);
const local = readJson("src-tauri/capabilities/default.json");
assert.deepEqual(local.permissions, [
  "core:default",
  "allow-get-system-info",
  "allow-get-desktop-diagnostics",
  "allow-open-school-portal",
]);
assert.deepEqual(readJson("src-tauri/tauri.windows.conf.json").bundle.targets, ["nsis"]);
assert.equal(config.bundle.windows.nsis.installMode, "currentUser");
assert.equal(config.bundle.windows.allowDowngrades, false);
for (const [field, width, height] of [
  ["headerImage", 150, 57],
  ["sidebarImage", 164, 314],
]) {
  const file = readFileSync(`src-tauri/${config.bundle.windows.nsis[field]}`);
  assert.equal(file.toString("ascii", 0, 2), "BM");
  assert.equal(file.readInt32LE(18), width);
  assert.equal(file.readInt32LE(22), height);
  assert.equal(file.readUInt16LE(28), 24, "Installer BMP must be RGB 24-bit");
}
const dmg = readFileSync(`src-tauri/${config.bundle.macOS.dmg.background}`);
assert.equal(dmg.toString("ascii", 1, 4), "PNG");
assert.equal(dmg.readUInt32BE(16), config.bundle.macOS.dmg.windowSize.width);
assert.equal(dmg.readUInt32BE(20), config.bundle.macOS.dmg.windowSize.height);
assert(existsSync("src-tauri/Cargo.lock"));
if (process.env.GITHUB_REF_TYPE === "tag")
  assert.equal(
    process.env.GITHUB_REF_NAME,
    `v${config.version}`,
    "Release tag must match application version",
  );
console.log("Desktop launcher, production origin, CSP, lockfile and versions verified.");
