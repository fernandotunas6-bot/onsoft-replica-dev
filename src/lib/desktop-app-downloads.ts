/**
 * Transferência da app SIGA Plus para computador (Tauri), dentro do SIGA.
 *
 * Os instaladores ficam nas releases públicas do GitHub. O workflow
 * `release-desktop.yml` publica cópias com nomes fixos
 * (`scripts/desktop/stable-assets.mjs`), por isso os links apontam sempre para a
 * última versão publicada. O site (`painel/web/src/lib/desktop-downloads.ts`) usa os
 * mesmos nomes; `tests/tauri/stable-assets.test.ts` confirma os dois.
 */

export type DesktopOs = "windows" | "macos" | "linux";

export type DesktopAsset = {
  os: DesktopOs;
  file: string;
  /** Formato mostrado no botão. */
  format: string;
  primary: boolean;
};

export const DESKTOP_RELEASES_REPO = "fernandotunas6-bot/onsoft-replica-dev";

export const DESKTOP_OS_LABEL: Record<DesktopOs, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

export const DESKTOP_ASSETS: DesktopAsset[] = [
  {
    os: "windows",
    file: "SIGA-Desktop-Windows-x64-setup.exe",
    format: "Instalador .exe",
    primary: true,
  },
  { os: "macos", file: "SIGA-Desktop-macOS-universal.dmg", format: "Imagem .dmg", primary: true },
  // .deb primeiro: ~5 MB contra ~80 MB do AppImage, o que conta em ligações lentas.
  {
    os: "linux",
    file: "SIGA-Desktop-Linux-amd64.deb",
    format: "Pacote .deb (Ubuntu, Debian)",
    primary: true,
  },
  {
    os: "linux",
    file: "SIGA-Desktop-Linux-x86_64.rpm",
    format: "Pacote .rpm (Fedora, openSUSE)",
    primary: false,
  },
  {
    os: "linux",
    file: "SIGA-Desktop-Linux-x86_64.AppImage",
    format: "AppImage (outras)",
    primary: false,
  },
];

/** Somas SHA-256 dos instaladores, juntas pelo workflow de publicação. */
export const DESKTOP_CHECKSUMS_FILE = "SHA256SUMS.txt";

export const DESKTOP_RELEASES_PAGE = `https://github.com/${DESKTOP_RELEASES_REPO}/releases/latest`;

export function desktopDownloadUrl(file: string) {
  return `https://github.com/${DESKTOP_RELEASES_REPO}/releases/latest/download/${file}`;
}

export function desktopAssetsFor(os: DesktopOs) {
  return DESKTOP_ASSETS.filter((asset) => asset.os === os);
}

export function primaryDesktopAsset(os: DesktopOs) {
  return desktopAssetsFor(os).find((asset) => asset.primary) ?? desktopAssetsFor(os)[0]!;
}

/** Sistema de quem visita, para destacar o botão certo. Telemóveis e tablets: null. */
export function detectDesktopOs(userAgent: string, platform = ""): DesktopOs | null {
  const ua = userAgent.toLowerCase();
  const pf = platform.toLowerCase();
  if (/android|iphone|ipad|ipod|mobile/.test(ua)) return null;
  if (pf.includes("win") || ua.includes("windows")) return "windows";
  if (pf.includes("mac") || ua.includes("mac os x") || ua.includes("macintosh")) return "macos";
  if (pf.includes("linux") || ua.includes("linux") || ua.includes("x11")) return "linux";
  return null;
}

export type DesktopRelease = {
  version: string;
  publishedAt: string;
  /** Tamanho em bytes por nome de ficheiro. */
  sizes: Record<string, number>;
};

/** Lê a resposta de `GET /repos/{repo}/releases/latest`; sem instaladores conhecidos, null. */
export function parseDesktopRelease(data: unknown): DesktopRelease | null {
  if (!data || typeof data !== "object") return null;
  const release = data as {
    tag_name?: unknown;
    published_at?: unknown;
    assets?: unknown;
  };
  if (typeof release.tag_name !== "string") return null;
  const files = new Set(DESKTOP_ASSETS.map((asset) => asset.file));
  const sizes: Record<string, number> = {};
  for (const asset of Array.isArray(release.assets) ? release.assets : []) {
    const { name, size } = (asset ?? {}) as { name?: unknown; size?: unknown };
    if (typeof name === "string" && typeof size === "number" && files.has(name)) {
      sizes[name] = size;
    }
  }
  if (Object.keys(sizes).length === 0) return null;
  return {
    version: release.tag_name.replace(/^v/, ""),
    publishedAt: typeof release.published_at === "string" ? release.published_at : "",
    sizes,
  };
}

/**
 * Versão e tamanhos da última release publicada (API pública do GitHub). Só informa:
 * sem resposta, os links continuam a funcionar.
 */
export async function fetchLatestDesktopRelease(
  fetcher: typeof fetch = fetch,
): Promise<DesktopRelease | null> {
  try {
    const response = await fetcher(
      `https://api.github.com/repos/${DESKTOP_RELEASES_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) return null;
    return parseDesktopRelease(await response.json());
  } catch {
    return null;
  }
}

export function formatDownloadSize(bytes: number | undefined) {
  if (!bytes) return null;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}
