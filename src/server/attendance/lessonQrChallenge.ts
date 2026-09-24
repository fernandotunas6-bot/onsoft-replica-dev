// Server-only QR challenge core. The API must verify the authenticated teacher,
// institutional membership and immutable published lesson before calling this module.
export type LessonQrOperation = "check_in" | "check_out";
export type LessonQrIdentity = {
  schoolId: string;
  snapshotId: string;
  lessonId: string;
  teacherId: string;
  operation: LessonQrOperation;
};
type SignedClaims = LessonQrIdentity & {
  nonce: string;
  issuedAtMs: number;
  expiresAtMs: number;
};
export type AtomicQrStore = {
  // Register before exposing the signed token. Persistence must enforce
  // nonce uniqueness and verify the published lesson and teacher assignment.
  register(input: QrStoreRecord): Promise<void>;
  // Must be a conditional atomic UPDATE of a registered, unexpired nonce.
  // false means missing, expired or already consumed.
  consume(input: QrStoreRecord): Promise<boolean>;
};
export type QrStoreRecord = {
    nonceHash: string;
    schoolId: string;
    snapshotId: string;
    lessonId: string;
    teacherId: string;
    operation: LessonQrOperation;
    issuedAtMs: number;
    expiresAtMs: number;
};

const encoder = new TextEncoder();
const MAX_LIFETIME_MS = 120_000;
const MAX_FUTURE_SKEW_MS = 5_000;
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 2048) throw new Error("QR inválido.");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function assertIdentity(identity: LessonQrIdentity): void {
  if (![identity.schoolId, identity.snapshotId, identity.lessonId, identity.teacherId]
      .every((value) => typeof value === "string" && value.trim().length > 0) ||
      !["check_in", "check_out"].includes(identity.operation)) {
    throw new Error("Vínculo da aula inválido.");
  }
}
function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
export async function importLessonQrKey(secret: Uint8Array): Promise<CryptoKey> {
  if (secret.byteLength < 32) throw new Error("Chave QR insuficiente.");
  return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function issueLessonQr(
  identity: LessonQrIdentity,
  key: CryptoKey,
  store: AtomicQrStore,
  nowMs: number,
  lifetimeMs = 60_000,
): Promise<string> {
  assertIdentity(identity);
  if (!validTime(nowMs) || !Number.isSafeInteger(lifetimeMs) ||
      lifetimeMs < 1 || lifetimeMs > MAX_LIFETIME_MS) {
    throw new Error("Prazo do QR inválido.");
  }
  const claims: SignedClaims = {
    ...identity, nonce: base64url(crypto.getRandomValues(new Uint8Array(24))),
    issuedAtMs: nowMs, expiresAtMs: nowMs + lifetimeMs,
  };
  if (!validTime(claims.expiresAtMs)) throw new Error("Prazo do QR inválido.");
  const body = base64url(encoder.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  const nonceHash = base64url(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", decode64url(claims.nonce))));
  await store.register({ nonceHash, ...identity, issuedAtMs: claims.issuedAtMs,
    expiresAtMs: claims.expiresAtMs });
  return body + "." + base64url(signature);
}
export async function consumeLessonQr(
  token: string,
  expected: LessonQrIdentity,
  key: CryptoKey,
  store: AtomicQrStore,
  nowMs: number,
): Promise<boolean> {
  assertIdentity(expected);
  if (!validTime(nowMs) || typeof token !== "string" || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const bodyBytes = decode64url(parts[0]);
    const signature = decode64url(parts[1]);
    if (signature.length !== 32 ||
        !await crypto.subtle.verify("HMAC", key, signature, encoder.encode(parts[0]))) return false;
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes));
    if (typeof parsed !== "object" || parsed === null) return false;
    const claims = parsed as Partial<SignedClaims>;
    if (claims.schoolId !== expected.schoolId ||
        claims.snapshotId !== expected.snapshotId ||
        claims.lessonId !== expected.lessonId ||
        claims.teacherId !== expected.teacherId ||
        claims.operation !== expected.operation ||
        typeof claims.nonce !== "string" ||
        !/^[A-Za-z0-9_-]{32}$/.test(claims.nonce) ||
        !validTime(claims.issuedAtMs as number) ||
        !validTime(claims.expiresAtMs as number) ||
        (claims.expiresAtMs as number) <= (claims.issuedAtMs as number) ||
        (claims.expiresAtMs as number) - (claims.issuedAtMs as number) > MAX_LIFETIME_MS ||
        nowMs < (claims.issuedAtMs as number) - MAX_FUTURE_SKEW_MS ||
        nowMs >= (claims.expiresAtMs as number)) return false;
    const nonceBytes = decode64url(claims.nonce);
    if (nonceBytes.byteLength !== 24) return false;
    const nonceHash = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", nonceBytes)));
    return store.consume({
      nonceHash, ...expected, issuedAtMs: claims.issuedAtMs as number,
      expiresAtMs: claims.expiresAtMs as number,
    });
  } catch {
    return false;
  }
}
