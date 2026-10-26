import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ANDROID_ASSETS,
  ANDROID_CHECKSUMS_FILE,
  ANDROID_RELEASE_TAG,
  androidDownloadUrl,
  fetchAndroidRelease,
  isAndroidVisitor,
} from "../../painel/web/src/lib/android-downloads";

const workflow = readFileSync(".github/workflows/estudo-yft-android.yml", "utf8");

describe("APK Android no site (/download)", () => {
  it("os ficheiros do site são os que o workflow publica, na release «android»", () => {
    for (const asset of ANDROID_ASSETS) expect(workflow).toContain(asset.file);
    expect(workflow).toContain(ANDROID_CHECKSUMS_FILE);
    expect(ANDROID_RELEASE_TAG).toBe("android");
    expect(workflow).toMatch(/gh release create android /);
    expect(androidDownloadUrl("x.apk")).toMatch(/\/releases\/download\/android\/x\.apk$/);
  });

  it("a release «android» nunca passa a ser a «latest»: os botões do desktop ligam a latest", () => {
    // O comando continua nas linhas seguintes (`\`): lê-se até ao fim do bloco `if`.
    const start = workflow.indexOf("gh release create android");
    const create = workflow.slice(start, workflow.indexOf("\n          fi", start));
    expect(start).toBeGreaterThan(-1);
    expect(create).toContain("--latest=false");
    expect(workflow).toMatch(/gh release edit android[^\n]*--latest=false/);
  });

  it("reconhece o telemóvel Android, e não o computador", () => {
    expect(
      isAndroidVisitor("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 Mobile"),
    ).toBe(true);
    expect(isAndroidVisitor("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    expect(isAndroidVisitor("Mozilla/5.0 (X11; Linux x86_64)")).toBe(false);
  });

  it("lê versão, tamanhos e data do APK principal; sem release, null", async () => {
    const ok = async () =>
      new Response(
        JSON.stringify({
          name: "SIGA Plus Android 1.0.0",
          assets: [
            {
              name: "SIGA-Plus-Android-arm64.apk",
              size: 22_056_004,
              updated_at: "2026-10-26T19:00:00Z",
            },
            {
              name: "SIGA-Plus-Android-armv7.apk",
              size: 20_030_464,
              updated_at: "2026-10-26T19:00:01Z",
            },
            { name: "SHA256SUMS-android.txt", size: 200 },
          ],
        }),
      );
    expect(await fetchAndroidRelease(ok as typeof fetch)).toEqual({
      version: "1.0.0",
      updatedAt: "2026-10-26T19:00:00Z",
      sizes: {
        "SIGA-Plus-Android-arm64.apk": 22_056_004,
        "SIGA-Plus-Android-armv7.apk": 20_030_464,
      },
    });
    const missing = async () => new Response("{}", { status: 404 });
    expect(await fetchAndroidRelease(missing as typeof fetch)).toBeNull();
  });
});
