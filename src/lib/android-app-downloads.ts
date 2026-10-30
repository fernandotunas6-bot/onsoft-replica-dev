/**
 * Transferência da app SIGA Plus para Android, dentro do SIGA (/transferir).
 *
 * O workflow `estudo-yft-android.yml` publica os APK na release «android» com nomes
 * fixos. Essa release nunca é a «latest» do repositório (é a do SIGA Desktop), por
 * isso os links apontam para a tag `android`. O site
 * (`painel/web/src/lib/android-downloads.ts`) usa os mesmos nomes;
 * `tests/tauri/android-downloads.test.ts` confere os dois.
 */
import { DESKTOP_RELEASES_REPO } from "@/lib/desktop-app-downloads";

export type AndroidAsset = {
  file: string;
  /** Texto do botão ou da ligação. */
  label: string;
  primary: boolean;
};

export const ANDROID_RELEASE_TAG = "android";

export const ANDROID_ASSETS: AndroidAsset[] = [
  // arm64 serve quase todos os telemóveis; armv7, os antigos de 32 bits.
  { file: "SIGA-Plus-Android-arm64.apk", label: "Transferir para Android", primary: true },
  {
    file: "SIGA-Plus-Android-armv7.apk",
    label: "Telemóveis mais antigos (32 bits)",
    primary: false,
  },
];

/** Certificado que assina os APK (o mesmo do site e do workflow). */
export const ANDROID_SIGNING_SHA256 =
  "B3:40:33:FF:64:86:DC:0C:A0:44:9E:8D:15:CE:71:1F:08:A0:0E:34:D8:50:8C:0C:8E:54:D9:96:30:02:EF:57";

/** Somas SHA-256 dos dois APK, juntas pelo workflow. */
export const ANDROID_CHECKSUMS_FILE = "SHA256SUMS-android.txt";

export function androidDownloadUrl(file: string) {
  return `https://github.com/${DESKTOP_RELEASES_REPO}/releases/download/${ANDROID_RELEASE_TAG}/${file}`;
}

/** Telemóvel ou tablet Android. */
export function isAndroidVisitor(userAgent: string) {
  return /android/i.test(userAgent);
}

export type AndroidRelease = {
  version: string;
  /** Tamanho em bytes por nome de ficheiro. */
  sizes: Record<string, number>;
};

/** Lê `GET /repos/{repo}/releases/tags/android`; sem APK conhecidos, null. */
export function parseAndroidRelease(data: unknown): AndroidRelease | null {
  if (!data || typeof data !== "object") return null;
  const release = data as { name?: unknown; assets?: unknown };
  const files = new Set(ANDROID_ASSETS.map((asset) => asset.file));
  const sizes: Record<string, number> = {};
  for (const asset of Array.isArray(release.assets) ? release.assets : []) {
    const { name, size } = (asset ?? {}) as { name?: unknown; size?: unknown };
    if (typeof name === "string" && typeof size === "number" && files.has(name)) {
      sizes[name] = size;
    }
  }
  if (Object.keys(sizes).length === 0) return null;
  const version =
    typeof release.name === "string" ? (release.name.match(/\d+\.\d+\.\d+/)?.[0] ?? "") : "";
  return { version, sizes };
}

/** Versão e tamanhos dos APK. Só informa: sem resposta, os links continuam a funcionar. */
export async function fetchAndroidRelease(
  fetcher: typeof fetch = fetch,
): Promise<AndroidRelease | null> {
  try {
    const response = await fetcher(
      `https://api.github.com/repos/${DESKTOP_RELEASES_REPO}/releases/tags/${ANDROID_RELEASE_TAG}`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) return null;
    return parseAndroidRelease(await response.json());
  } catch {
    return null;
  }
}
