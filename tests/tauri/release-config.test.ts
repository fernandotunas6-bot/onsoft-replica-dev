import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — script Node em JavaScript, sem declarações de tipos.
import { releaseConfig } from "../../scripts/desktop/release-config.mjs";

describe("publicação da app desktop", () => {
  it("sem as duas chaves, sai sem updater (a app continua a abrir)", () => {
    expect(releaseConfig({ pubkey: "", hasPrivateKey: false, repository: "a/b" })).toEqual({});
    // Só a pública não chega: o build falhava ao assinar.
    expect(releaseConfig({ pubkey: "PUB", hasPrivateKey: false, repository: "a/b" })).toEqual({});
    expect(releaseConfig({ pubkey: " ", hasPrivateKey: true, repository: "a/b" })).toEqual({});
  });

  it("com as duas chaves, liga o updater ao latest.json da release publicada", () => {
    const config = releaseConfig({
      pubkey: " PUB ",
      hasPrivateKey: true,
      repository: "fernandotunas6-bot/onsoft-replica-dev",
    });
    expect(config.bundle).toEqual({ createUpdaterArtifacts: true });
    expect(config.plugins.updater).toEqual({
      pubkey: "PUB",
      endpoints: [
        "https://github.com/fernandotunas6-bot/onsoft-replica-dev/releases/latest/download/latest.json",
      ],
    });
    expect(() =>
      releaseConfig({ pubkey: "PUB", hasPrivateKey: true, repository: "../../x" }),
    ).toThrow(/Repositório inválido/);
  });

  it("o workflow de versões assina e junta a configuração ao build", () => {
    const workflow = readFileSync(".github/workflows/release-desktop.yml", "utf8");
    expect(workflow).toContain("node scripts/desktop/release-config.mjs");
    expect(workflow).toContain("--config src-tauri/tauri.release.conf.json");
    expect(workflow).toContain(
      "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}",
    );
    expect(workflow).toMatch(/releaseDraft: true/);
  });

  it("o arranque manual cria a tag da versão da app e usa-a em todo o lado", () => {
    const workflow = readFileSync(".github/workflows/release-desktop.yml", "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("format('v{0}', inputs.version)");
    expect(workflow).toContain('git push origin "refs/tags/$RELEASE_TAG"');
    expect(workflow).toContain("tagName: ${{ env.RELEASE_TAG }}");
    // Fora da definição de RELEASE_TAG, nada pode usar o ramo (main) como nome da versão.
    expect(workflow.match(/github\.ref_name/g)).toHaveLength(1);
  });
});
