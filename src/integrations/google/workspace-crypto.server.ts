/** Server-only helpers: never import into the browser build. */
function encryptionKey(): Promise<CryptoKey> {
  const encoded = process.env["GOOGLE_WORKSPACE_ENCRYPTION_KEY"]?.trim();
  if (!encoded) throw new Error("GOOGLE_WORKSPACE_ENCRYPTION_KEY não configurada.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength !== 32) throw new Error("A chave Google Workspace deve ter 32 bytes em base64.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export function randomBase64Url(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(value).toString("base64url");
}
export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("base64url");
}
export async function encryptWorkspaceSecret(value: string): Promise<string> {
  if (!value) throw new Error("Não é possível guardar um token vazio.");
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(value),
  );
  return ["v1", Buffer.from(iv).toString("base64url"),
    Buffer.from(payload).toString("base64url")].join(".");
}
export async function decryptWorkspaceSecret(value: string): Promise<string> {
  const [version, iv, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Token encriptado inválido.");
  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64url") },
    key, Buffer.from(ciphertext, "base64url"),
  );
  return new TextDecoder().decode(plaintext);
}
