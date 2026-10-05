import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
  plugins?: { updater?: { pubkey?: string } };
};

describe("arranque da app desktop", () => {
  // Sem `plugins.updater`, registar o plugin termina a app ao abrir:
  // PluginInitialization("updater", "… invalid type: null, expected struct Config").
  it("o updater só é registado depois de verificar a configuração", () => {
    const registrations = [...lib.matchAll(/tauri_plugin_updater::Builder/g)];
    expect(registrations.length).toBeGreaterThan(0);
    for (const match of registrations) {
      const before = lib.slice(Math.max(0, match.index - 200), match.index);
      expect(before).toContain("if updater_configured(");
    }
    expect(readFileSync("src-tauri/src/school/mod.rs", "utf8")).toMatch(
      /fn updater_configured\([^)]*\) -> bool/,
    );
  });

  it("a configuração publicada não traz updater sem chave pública", () => {
    const updater = config.plugins?.updater;
    if (updater) expect(updater.pubkey?.trim()).toBeTruthy();
  });
});
