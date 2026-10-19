import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — script Node em JavaScript, sem declarações de tipos.
import * as stableAssets from "../../scripts/desktop/stable-assets.mjs";
import { DESKTOP_ASSETS, DESKTOP_CHECKSUMS_FILE } from "../../painel/web/src/lib/desktop-downloads";

const { STABLE_ASSET_NAMES, stableAssetName, stableCopies } = stableAssets as {
  STABLE_ASSET_NAMES: Record<string, string>;
  stableAssetName: (path: string) => string | null;
  stableCopies: (paths: string[]) => Map<string, string>;
};

describe("instaladores com nomes fixos para o site", () => {
  it("cada instalador do tauri-action tem um nome fixo; o resto fica de fora", () => {
    expect(stableAssetName("C:/a/nsis/SIGA Desktop_1.1.0_x64-setup.exe")).toBe(
      "SIGA-Desktop-Windows-x64-setup.exe",
    );
    expect(stableAssetName("/a/dmg/SIGA Desktop_1.1.0_universal.dmg")).toBe(
      "SIGA-Desktop-macOS-universal.dmg",
    );
    expect(stableAssetName("/a/appimage/SIGA Desktop_1.1.0_amd64.AppImage")).toBe(
      "SIGA-Desktop-Linux-x86_64.AppImage",
    );
    expect(stableAssetName("/a/deb/SIGA Desktop_1.1.0_amd64.deb")).toBe(
      "SIGA-Desktop-Linux-amd64.deb",
    );
    expect(stableAssetName("/a/rpm/SIGA Desktop-1.1.0-1.x86_64.rpm")).toBe(
      "SIGA-Desktop-Linux-x86_64.rpm",
    );
    for (const other of [
      "/a/nsis/SIGA Desktop_1.1.0_x64-setup.exe.sig",
      "/a/macos/SIGA Desktop.app.tar.gz",
      "/a/macos/SIGA Desktop.app.tar.gz.sig",
      "/a/appimage/SIGA Desktop_1.1.0_amd64.AppImage.sig",
    ]) {
      expect(stableAssetName(other)).toBeNull();
    }
  });

  it("recusa dois ficheiros para o mesmo nome fixo", () => {
    expect(() => stableCopies(["/a/x-setup.exe", "/b/y-setup.exe"])).toThrow(/Dois instaladores/);
  });

  it("o site liga exactamente aos nomes que o workflow publica", () => {
    const published = Object.values(STABLE_ASSET_NAMES).sort();
    const linked = DESKTOP_ASSETS.map((asset) => asset.file).sort();
    expect(linked).toEqual(published);
  });

  it("o workflow de publicação exige os mesmos ficheiros", () => {
    const workflow = readFileSync(".github/workflows/publish-desktop-release.yml", "utf8");
    for (const name of Object.values(STABLE_ASSET_NAMES)) expect(workflow).toContain(name);
    expect(workflow).toContain(`> ${DESKTOP_CHECKSUMS_FILE}`);
  });
});
