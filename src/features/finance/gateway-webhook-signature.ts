import { timingSafeEqual } from "@/lib/timing-safe-equal";

/**
 * Assinatura dos avisos de pagamento EMIS/Unitel → SIGA.
 *
 * Antes a API key ia no corpo JSON: ficava em logs de quem a enviasse, e um
 * pedido capturado podia ser repetido. Agora a key nunca viaja. O emissor
 * assina `"<timestamp>.<corpo exacto>"` com HMAC-SHA256 e envia:
 *
 *   X-SIGA-Timestamp: <segundos Unix>
 *   X-SIGA-Signature: sha256=<hex>
 *
 * O SIGA recusa carimbos fora de ±5 minutos; dentro da janela, o `externalId`
 * obrigatório e o índice único dos recibos impedem a repetição.
 */
export const GATEWAY_SIGNATURE_HEADER = "x-siga-signature";
export const GATEWAY_TIMESTAMP_HEADER = "x-siga-timestamp";
export const GATEWAY_SIGNATURE_TOLERANCE_SECONDS = 300;

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valor do cabeçalho `X-SIGA-Signature` para este corpo e carimbo. */
export async function signGatewayWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  return `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export type GatewayTimestampCheck = { ok: true } | { ok: false; message: string };

export function checkGatewayTimestamp(
  timestamp: string | null,
  nowMs = Date.now(),
): GatewayTimestampCheck {
  if (!timestamp || !/^\d{9,11}$/.test(timestamp)) {
    return { ok: false, message: "Cabeçalho X-SIGA-Timestamp em falta ou inválido." };
  }
  const skew = Math.abs(nowMs / 1000 - Number(timestamp));
  if (skew > GATEWAY_SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, message: "Pedido fora da janela de 5 minutos (relógio ou repetição)." };
  }
  return { ok: true };
}

/** A assinatura recebida corresponde a esta key? Comparação em tempo constante. */
export async function gatewaySignatureMatches(
  secret: string,
  timestamp: string,
  rawBody: string,
  received: string | null,
): Promise<boolean> {
  if (!secret || !received) return false;
  const expected = await signGatewayWebhook(secret, timestamp, rawBody);
  return timingSafeEqual(received.trim().toLowerCase(), expected);
}
