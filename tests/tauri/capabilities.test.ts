import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Capability = {
  identifier: string;
  local?: boolean;
  remote?: { urls: string[] };
  permissions: string[];
};

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
const build = readFileSync("src-tauri/build.rs", "utf8");

/** Comandos registados em `generate_handler!` (sem o caminho do módulo). */
const handlerCommands = () => {
  const block = lib.match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? "";
  return block
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
const development = readJson<{
  app: { security: { capabilities: Array<string | Capability> } };
}>("src-tauri/tauri.dev.conf.json").app.security.capabilities.find(
  (entry): entry is Capability => typeof entry === "object" && entry.identifier === "development",
)!;

describe("permissões dos comandos da app", () => {
  // Um comando que falte num destes sítios é recusado em produção.
  it("generate_handler! e o manifesto de build.rs listam os mesmos comandos", () => {
    expect(handlerCommands()).toEqual(manifestCommands());
  });

  it("cada allow-<comando> das capabilities existe no manifesto", () => {
    const manifest = new Set(manifestCommands());
    for (const capability of [portal, local, development]) {
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

  // Em `tauri dev` o devUrl é a origem local da app: uma capability só remota
  // nunca se aplicava e o portal em desenvolvimento ficava sem os comandos.
  it("em desenvolvimento, a capability aplica-se ao devUrl e cobre o portal", () => {
    expect(development.local).toBe(true);
    expect(development.remote).toBeUndefined();
    for (const permission of portal.permissions) {
      expect(development.permissions, permission).toContain(permission);
    }
  });
});
