/**
 * Transferência da app SIGA Plus para computador (Tauri).
 *
 * Os instaladores ficam nas releases públicas do GitHub. O workflow
 * `release-desktop.yml` publica cópias com nomes fixos
 * (`scripts/desktop/stable-assets.mjs`), por isso estes links apontam sempre para a
 * última versão publicada, sem mudar o site a cada release.
 *
 * Sem dependências de outros módulos: o teste em `tests/tauri/stable-assets.test.ts`
 * confirma que os nomes coincidem com os do workflow.
 */

export type DesktopOs = "windows" | "macos" | "linux"

export type DesktopAsset = {
  os: DesktopOs
  file: string
  /** Formato mostrado no botão. */
  format: string
  primary: boolean
}

export const DESKTOP_RELEASES_REPO =
  String(import.meta.env?.["VITE_DESKTOP_RELEASES_REPO"] ?? "").trim() ||
  "fernandotunas6-bot/onsoft-replica-dev"

export const DESKTOP_ASSETS: DesktopAsset[] = [
  { os: "windows", file: "SIGA-Desktop-Windows-x64-setup.exe", format: "Instalador .exe", primary: true },
  { os: "macos", file: "SIGA-Desktop-macOS-universal.dmg", format: "Imagem .dmg", primary: true },
  { os: "linux", file: "SIGA-Desktop-Linux-x86_64.AppImage", format: "AppImage", primary: true },
  { os: "linux", file: "SIGA-Desktop-Linux-amd64.deb", format: ".deb (Ubuntu, Debian)", primary: false },
  { os: "linux", file: "SIGA-Desktop-Linux-x86_64.rpm", format: ".rpm (Fedora, openSUSE)", primary: false },
]

export const DESKTOP_RELEASES_PAGE = `https://github.com/${DESKTOP_RELEASES_REPO}/releases/latest`

export function desktopDownloadUrl(file: string) {
  return `https://github.com/${DESKTOP_RELEASES_REPO}/releases/latest/download/${file}`
}

export function desktopAssetsFor(os: DesktopOs) {
  return DESKTOP_ASSETS.filter((asset) => asset.os === os)
}

/** Sistema do visitante, para destacar o botão certo. Telemóveis e tablets: null. */
export function detectDesktopOs(userAgent: string, platform = ""): DesktopOs | null {
  const ua = userAgent.toLowerCase()
  const pf = platform.toLowerCase()
  if (/android|iphone|ipad|ipod|mobile/.test(ua)) return null
  if (pf.includes("win") || ua.includes("windows")) return "windows"
  if (pf.includes("mac") || ua.includes("mac os x") || ua.includes("macintosh")) return "macos"
  if (pf.includes("linux") || ua.includes("linux") || ua.includes("x11")) return "linux"
  return null
}

export type DesktopRelease = {
  version: string
  publishedAt: string
  /** Tamanho em bytes por nome de ficheiro. */
  sizes: Record<string, number>
}

/**
 * Versão e tamanhos da última release publicada (API pública do GitHub). Só serve para
 * informação: sem resposta, os links continuam a funcionar.
 */
export async function fetchLatestDesktopRelease(
  fetcher: typeof fetch = fetch,
): Promise<DesktopRelease | null> {
  try {
    const response = await fetcher(
      `https://api.github.com/repos/${DESKTOP_RELEASES_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      tag_name?: string
      published_at?: string
      assets?: { name: string; size: number }[]
    }
    const files = new Set(DESKTOP_ASSETS.map((asset) => asset.file))
    const sizes: Record<string, number> = {}
    for (const asset of data.assets ?? []) {
      if (files.has(asset.name)) sizes[asset.name] = asset.size
    }
    if (!data.tag_name || Object.keys(sizes).length === 0) return null
    return {
      version: data.tag_name.replace(/^v/, ""),
      publishedAt: data.published_at ?? "",
      sizes,
    }
  } catch {
    return null
  }
}

export function formatSize(bytes: number | undefined) {
  if (!bytes) return null
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}
