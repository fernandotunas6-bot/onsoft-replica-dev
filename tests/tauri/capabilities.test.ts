import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Capability = {
  identifier: string;
  local?: boolean;
  remote?: { urls: string[] };
  permissions: string[];
};

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const lib = readFileSync("src-tauri/src/school/mod.rs", "utf8");
const bindings = readFileSync("src-tauri/src/bindings.rs", "utf8");
const build = readFileSync("src-tauri/build.rs", "utf8");

/** Comandos registados em `generate_handler!` (sem o caminho do módulo). */
const handlerCommands = () => {
  const block = lib.match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? "";
  const typed = bindings.match(/collect_commands!\[([\s\S]*?)\]/)?.[1] ?? "";
  return (block + "," + typed)
    .split(",")
    .map((name) => name.trim().split("::").pop()!)
    .filter(Boolean)
    .sort();
};

/** Comandos do manifesto da app em build.rs (geram `allow-<comando>`). */
const manifestCommands = () => {
  const block = build.match(/commands\(&\[([\s\S]*?)\]\)/)?.[1] ?? "";
  return [...block.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]!).sort();
};

const appPermissions = (capability: Capability) =>
  capability.permissions
    .filter((permission) => permission.startsWith("allow-"))
    .map((permission) => permission.slice("allow-".length).replaceAll("-", "_"));

const portal = readJson<Capability>("src-tauri/capabilities/school-portal.json");
const local = readJson<Capability>("src-tauri/capabilities/default.json");
const quickPane = readJson<Capability>("src-tauri/capabilities/quick-pane.json");
describe("permissões dos comandos da app", () => {
  // Um comando que falte num destes sítios é recusado em produção.
  it("generate_handler! e o manifesto de build.rs listam os mesmos comandos", () => {
    expect(handlerCommands()).toEqual(manifestCommands());
  });

  it("cada allow-<comando> das capabilities existe no manifesto", () => {
    const manifest = new Set(manifestCommands());
    for (const capability of [portal, local, quickPane]) {
      for (const command of appPermissions(capability)) {
        expect(manifest.has(command), `${capability.identifier}: ${command}`).toBe(true);
      }
    }
  });

  it("o portal só na origem exacta, sem plugins largos", () => {
    expect(portal.local).toBe(false);
    expect(portal.remote?.urls).toEqual(["https://portal-siga.com/*"]);
    expect(
      portal.permissions.filter((permission) =>
        /^(shell|fs|store|updater|process|stronghold|opener|dialog):/.test(permission),
      ),
    ).toEqual([]);
  });

  it("as janelas locais e o portal têm permissões separadas", () => {
    expect(readJson<{ windows: string[] }>("src-tauri/capabilities/default.json").windows).toEqual([
      "main",
    ]);
    expect(
      readJson<{ windows: string[] }>("src-tauri/capabilities/school-portal.json").windows,
    ).toEqual(["school"]);
    for (const command of [
      "allow-load-preferences",
      "allow-save-emergency-data",
      "allow-open-siga-portal",
    ]) {
      expect(portal.permissions).not.toContain(command);
      expect(local.permissions).toContain(command);
    }
  });
});
