import { signProfileAvatar } from "./server";

const AVATAR_REFERENCE_PREFIX = "siga-avatar://";
const LEGACY_AVATAR_PATH =
  /\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/avatar-[0-9]{13}\.(png|jpg|jpeg|webp)$/i;
const SIGNED_URL_TTL_MS = 100_000;

const cachedUrls = new Map<string, { expiresAt: number; url: string | null }>();
const pendingUrls = new Map<string, Promise<string | null>>();

export function isManagedProfileAvatarUrl(value?: string | null) {
  if (!value) return false;
  if (value.startsWith(AVATAR_REFERENCE_PREFIX)) return true;
  try {
    return LEGACY_AVATAR_PATH.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

/** Resolve avatars privados, incluindo URLs públicas legadas após tornar o bucket privado. */
export async function resolveProfileAvatarUrl(value: string): Promise<string | null> {
  const cached = cachedUrls.get(value);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let pending = pendingUrls.get(value);
  if (!pending) {
    pending = signProfileAvatar({ data: { avatarUrl: value } })
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
