import { describe, expect, it } from "vitest";
import {
  desktopDownloadUrl,
  detectDesktopOs,
  fetchLatestDesktopRelease,
  formatDownloadSize,
  parseDesktopRelease,
  primaryDesktopAsset,
} from "@/lib/desktop-app-downloads";

describe("transferir a app de computador", () => {
  it("reconhece o sistema; telemóveis ficam sem botão destacado", () => {
    expect(detectDesktopOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32")).toBe("windows");
    expect(detectDesktopOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)", "MacIntel")).toBe(
      "macos",
    );
    expect(detectDesktopOs("Mozilla/5.0 (X11; Ubuntu; Linux x86_64)", "Linux x86_64")).toBe(
      "linux",
    );
    expect(detectDesktopOs("Mozilla/5.0 (Linux; Android 14; SM-A146P) Mobile", "Linux")).toBe(null);
    expect(detectDesktopOs("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(null);
  });

  it("aponta sempre para a última versão publicada, com o .deb primeiro no Linux", () => {
    expect(desktopDownloadUrl(primaryDesktopAsset("windows").file)).toBe(
      "https://github.com/fernandotunas6-bot/onsoft-replica-dev/releases/latest/download/SIGA-Desktop-Windows-x64-setup.exe",
    );
    expect(primaryDesktopAsset("linux").file).toBe("SIGA-Desktop-Linux-amd64.deb");
  });

  it("lê versão e tamanhos só dos instaladores conhecidos", () => {
    expect(
      parseDesktopRelease({
        tag_name: "v1.3.1",
        published_at: "2026-10-26T15:30:13Z",
        assets: [
          { name: "SIGA-Desktop-Windows-x64-setup.exe", size: 90 * 1024 * 1024 },
          { name: "latest.json", size: 3000 },
        ],
      }),
    ).toEqual({
      version: "1.3.1",
      publishedAt: "2026-10-26T15:30:13Z",
      sizes: { "SIGA-Desktop-Windows-x64-setup.exe": 90 * 1024 * 1024 },
    });
    expect(parseDesktopRelease({ tag_name: "v1.3.1", assets: [] })).toBeNull();
    expect(parseDesktopRelease(null)).toBeNull();
    expect(formatDownloadSize(5.4 * 1024 * 1024)).toBe("5 MB");
    expect(formatDownloadSize(undefined)).toBeNull();
  });

  it("sem resposta do GitHub, devolve null em vez de falhar", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchLatestDesktopRelease(offline)).resolves.toBeNull();
    const notFound = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchLatestDesktopRelease(notFound)).resolves.toBeNull();
  });
});
