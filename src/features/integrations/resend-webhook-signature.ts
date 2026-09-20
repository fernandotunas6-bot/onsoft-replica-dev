import { timingSafeEqual } from "@/lib/timing-safe-equal";

/**
 * Verificação de assinatura dos webhooks do Resend (esquema Svix).
 *
 * Sem isto, qualquer pessoa podia injectar estados de entrega falsos em
 * `communication_dispatches` — o histórico de comunicações deixaria de servir
 * como prova de que a escola notificou um encarregado.
 *
 * Usa Web Crypto (e não `node:crypto`) porque a aplicação corre num Worker
 * Cloudflare.
 */

export interface ResendSignatureInput {
  /** Corpo do pedido exactamente como chegou — reserializar invalida a assinatura. */
  payload: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  /** Segredo do endpoint, no formato `whsec_<base64>`. */
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}

export type ResendSignatureResult = { valid: true } | { valid: false; reason: string };

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

function decodeSecret(secret: string): Uint8Array | null {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function verifyResendWebhookSignature(
  input: ResendSignatureInput,
): Promise<ResendSignatureResult> {
  const { payload, svixId, svixTimestamp, svixSignature, secret } = input;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, reason: "missing_headers" };
  }

  const key = decodeSecret(secret);
  if (!key) return { valid: false, reason: "invalid_secret" };

  // Janela temporal: impede reenvio de um pedido legítimo capturado antes.
  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { valid: false, reason: "invalid_timestamp" };
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { valid: false, reason: "timestamp_out_of_tolerance" };
  }

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(signedContent),
  );
  const expected = toBase64(signature);

  // O cabeçalho traz uma ou mais assinaturas separadas por espaço, cada uma
  // prefixada pela versão do esquema (`v1,<assinatura>`). Durante uma rotação
  // de segredo chegam duas — basta uma bater.
  const candidates = svixSignature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(",");
      return separator === -1
        ? { version: "", value: part }
        : { version: part.slice(0, separator), value: part.slice(separator + 1) };
    })
    .filter((candidate) => candidate.version === "v1");

  if (candidates.length === 0) return { valid: false, reason: "no_v1_signature" };

  const matched = candidates.some((candidate) => timingSafeEqual(candidate.value, expected));
  return matched ? { valid: true } : { valid: false, reason: "signature_mismatch" };
}

export function resolveResendWebhookSecret(): string | null {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}
