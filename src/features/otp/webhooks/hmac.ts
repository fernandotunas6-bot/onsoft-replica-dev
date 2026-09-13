import { timingSafeEqual } from "@/lib/timing-safe-equal";

/**
 * HMAC para verificação de assinaturas de webhooks, com Web Crypto.
 *
 * A aplicação é servida por um Worker Cloudflare e não há `nodejs_compat`
 * declarado em lado nenhum. O verificador do Twilio usava `require("crypto")`
 * — que não existe num módulo ESM — e `Buffer`, que é do Node. Enquanto o
 * endpoint não estava registado isso nunca corria; assim que passou a estar
 * (ARQ-02), tornou-se uma falha garantida em produção.
 *
 * Web Crypto existe nos dois ambientes e não precisa de polyfill.
 */

async function hmac(algorithm: "SHA-1" | "SHA-256", secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function hmacHex(
  algorithm: "SHA-1" | "SHA-256",
  secret: string,
  message: string,
): Promise<string> {
  return toHex(await hmac(algorithm, secret, message));
}

export async function hmacBase64(
  algorithm: "SHA-1" | "SHA-256",
  secret: string,
  message: string,
): Promise<string> {
  return toBase64(await hmac(algorithm, secret, message));
}

/**
 * Comparação em tempo constante que nunca lança.
 *
 * `crypto.timingSafeEqual` do Node atira quando os buffers têm tamanhos
 * diferentes — e uma assinatura forjada com o comprimento errado é exactamente
 * o caso que isto tem de tratar. A versão anterior do verificador do Twilio
 * respondia 500 a um ataque em vez de 401.
 */
export function signaturesMatch(expected: string, received: string): boolean {
  return timingSafeEqual(expected, received);
}
