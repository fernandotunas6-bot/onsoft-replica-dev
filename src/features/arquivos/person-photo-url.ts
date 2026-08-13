import { signSchoolFile } from "./server";

const PRIVATE_PHOTO_PREFIX = "siga-file://";
const SIGNED_URL_TTL_MS = 100_000;

const cachedUrls = new Map<string, { expiresAt: number; url: string | null }>();
const pendingUrls = new Map<string, Promise<string | null>>();

function privatePhotoFileId(value: string) {
  const id = value.slice(PRIVATE_PHOTO_PREFIX.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function isPrivatePersonPhotoUrl(value?: string | null) {
  return Boolean(value?.startsWith(PRIVATE_PHOTO_PREFIX) && privatePhotoFileId(value));
}

/** Resolve fotos privadas da biblioteca e reutiliza a URL assinada por 100 segundos. */
export async function resolvePersonPhotoUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith(PRIVATE_PHOTO_PREFIX)) return value;

  const fileId = privatePhotoFileId(value);
  if (!fileId) return null;
  const cached = cachedUrls.get(value);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let pending = pendingUrls.get(value);
  if (!pending) {
    pending = signSchoolFile({ data: { id: fileId } })
      .then((result) => result.url)
      .catch(() => null)
      .then((url) => {
        cachedUrls.set(value, { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS });
        return url;
      })
      .finally(() => pendingUrls.delete(value));
    pendingUrls.set(value, pending);
  }
  return pending;
}
