export function createOpaqueId(prefix: string, length = 20) {
  const value = crypto.randomUUID().replaceAll("-", "").slice(0, length);
  return `${prefix}_${value}`;
}

export function createMerchantReference() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `PF${timestamp}${suffix}`;
}

export function createReceiptCode() {
  const year = new Date().getUTCFullYear();
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
  return `REC-${year}-${suffix}`;
}

export function createTransferReference() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return `PF-TF-${day}-${suffix}`;
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isStudentCode(value: string) {
  return /^\d{7}$/.test(value);
}

const PIN_HASH_ITERATIONS = 120_000;

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePaymentPin(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPaymentPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePaymentPin(pin, salt, PIN_HASH_ITERATIONS);
  return `pbkdf2_sha256$${PIN_HASH_ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(derived)}`;
}

export async function verifyPaymentPin(pin: string, storedHash: string) {
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const legacyHash = await sha256(pin);
    return constantTimeEqual(new TextEncoder().encode(legacyHash), new TextEncoder().encode(storedHash));
  }

  const [algorithm, iterationsValue, saltValue, hashValue] = storedHash.split("$");
  const iterations = Number(iterationsValue);
  if (
    algorithm !== "pbkdf2_sha256" ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  try {
    const derived = await derivePaymentPin(pin, decodeBase64Url(saltValue), iterations);
    return constantTimeEqual(derived, decodeBase64Url(hashValue));
  } catch {
    return false;
  }
}
