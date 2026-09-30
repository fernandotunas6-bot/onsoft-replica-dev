import { describe, expect, it } from "vitest";
// @ts-expect-error — script Node em JavaScript, sem declarações de tipos.
import { releaseConfig, versionFromRef } from "../../scripts/desktop/release-config.mjs";

describe("publicação da app desktop", () => {
  it("tira a versão da tag", () => {
    expect(versionFromRef("desktop-v1.2.3")).toBe("1.2.3");
    expect(versionFromRef("1.0.1")).toBe("1.0.1");
    expect(() => versionFromRef("main")).toThrow(/Versão inválida/);
    expect(() => versionFromRef("desktop-v1.2")).toThrow();
  });

  it("sem chave de assinatura, sai sem updater (a app continua a abrir)", () => {
    expect(
      releaseConfig({ version: "1.0.1", pubkey: "", hasPrivateKey: false, repository: "a/b" }),
    ).toEqual({ version: "1.0.1" });
    // Só a pública não chega: o build falhava ao assinar.
    expect(
      releaseConfig({ version: "1.0.1", pubkey: "PUB", hasPrivateKey: false, repository: "a/b" }),
    ).toEqual({ version: "1.0.1" });
  });

  it("com as duas chaves, liga o updater ao latest.json da release publicada", () => {
    const config = releaseConfig({
      version: "1.0.1",
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
  });
});
