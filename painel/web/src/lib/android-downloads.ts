/**
 * Transferência da app SIGA Plus para Android (estudo/yft-school-system, modo SIGA).
 *
 * O workflow `estudo-yft-android.yml` publica os APK na release «android» com nomes
 * fixos. Essa release nunca é a «latest» do repositório (é a do SIGA Desktop), por
 * isso os links apontam para a tag `android` e não para releases/latest.
 *
 * Importa só por caminho relativo: o teste em `tests/tauri/android-downloads.test.ts`
 * confirma que os nomes coincidem com os do workflow, a partir da raiz do repositório.
 */
import { DESKTOP_RELEASES_REPO } from "./desktop-downloads"

export type AndroidAsset = {
  file: string
  /** Texto do botão ou da ligação. */
  label: string
  primary: boolean
}

export const ANDROID_RELEASE_TAG = "android"

export const ANDROID_ASSETS: AndroidAsset[] = [
  // arm64 serve quase todos os telemóveis; armv7, os antigos de 32 bits.
  { file: "SIGA-Plus-Android-arm64.apk", label: "Transferir para Android", primary: true },
  { file: "SIGA-Plus-Android-armv7.apk", label: "Telemóveis mais antigos (32 bits)", primary: false },
]

/**
 * Impressão digital SHA-256 do certificado que assina os APK (chave de upload do
 * SIGA Plus). Pública: serve para confirmar que um APK é o oficial. Muda só se a
 * chave mudar, e então as versões instaladas deixam de actualizar por cima.
 */
export const ANDROID_SIGNING_SHA256 =
  "B3:40:33:FF:64:86:DC:0C:A0:44:9E:8D:15:CE:71:1F:08:A0:0E:34:D8:50:8C:0C:8E:54:D9:96:30:02:EF:57"

/** Somas SHA-256 dos dois APK, juntas pelo workflow. */
export const ANDROID_CHECKSUMS_FILE = "SHA256SUMS-android.txt"

export const ANDROID_RELEASE_PAGE = `https://github.com/${DESKTOP_RELEASES_REPO}/releases/tag/${ANDROID_RELEASE_TAG}`

export function androidDownloadUrl(file: string) {
  return `https://github.com/${DESKTOP_RELEASES_REPO}/releases/download/${ANDROID_RELEASE_TAG}/${file}`
}

/** Telemóvel ou tablet Android (o `detectDesktopOs` devolve null para estes). */
export function isAndroidVisitor(userAgent: string) {
  return /android/i.test(userAgent)
}

export type AndroidRelease = {
  version: string
  /** Data do APK principal: a release «android» é a mesma, os ficheiros é que mudam. */
  updatedAt: string
  /** Tamanho em bytes por nome de ficheiro. */
  sizes: Record<string, number>
}

/**
 * Versão e tamanhos da release «android» (API pública do GitHub). Só serve para
 * informação: sem resposta, os links continuam a funcionar.
 */
export async function fetchAndroidRelease(
  fetcher: typeof fetch = fetch,
): Promise<AndroidRelease | null> {
  try {
    const response = await fetcher(
      `https://api.github.com/repos/${DESKTOP_RELEASES_REPO}/releases/tags/${ANDROID_RELEASE_TAG}`,
      { headers: { Accept: "application/vnd.github+json" } },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      name?: string
      assets?: { name: string; size: number; updated_at?: string }[]
    }
    const files = new Set(ANDROID_ASSETS.map((asset) => asset.file))
    const sizes: Record<string, number> = {}
    let updatedAt = ""
    for (const asset of data.assets ?? []) {
      if (!files.has(asset.name)) continue
      sizes[asset.name] = asset.size
      if (asset.name === ANDROID_ASSETS[0]?.file) updatedAt = asset.updated_at ?? ""
    }
    if (Object.keys(sizes).length === 0) return null
    return { version: data.name?.match(/\d+\.\d+\.\d+/)?.[0] ?? "", updatedAt, sizes }
  } catch {
    return null
  }
}
