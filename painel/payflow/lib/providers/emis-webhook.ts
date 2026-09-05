/** Header esperado até a documentação oficial EMIS definir o nome canónico. */
export const EMIS_WEBHOOK_SIGNATURE_HEADER = "x-emis-signature";

/**
 * O adaptador de produção ainda não liquida. Mesmo com assinatura válida o
 * ingress só confirma recepção segura — nunca muda estado financeiro.
 */
export function isEmisProductionAdapterEnabled() {
  return false;
}

export type EmisWebhookDecision =
  | { ok: false; status: number; code: string; message: string }
  | {
      ok: true;
      settle: false;
      status: 501;
      code: "emis_adapter_not_ready";
      message: string;
    };

export function decideEmisWebhookIngress(input: {
  homologated: boolean;
  signatureValid: boolean;
  productionAdapterEnabled: boolean;
}): EmisWebhookDecision {
  if (!input.homologated) {
    return {
      ok: false,
      status: 503,
      code: "emis_not_homologated",
      message:
        "Webhook EMIS recusado: falta PAYFLOW_EMIS_HOMOLOGATED=1 e credenciais mínimas (BASE_URL, API_KEY, WEBHOOK_SECRET).",
    };
  }
  if (!input.signatureValid) {
    return {
      ok: false,
      status: 401,
      code: "emis_webhook_signature_invalid",
      message: "Assinatura do webhook EMIS inválida ou ausente.",
    };
  }
  if (!input.productionAdapterEnabled) {
    return {
      ok: true,
      settle: false,
      status: 501,
      code: "emis_adapter_not_ready",
      message:
        "Credenciais homologadas, mas o adaptador de produção EMIS ainda não liquida pagamentos.",
    };
  }
  return {
    ok: false,
    status: 501,
    code: "emis_adapter_not_ready",
    message: "Adaptador EMIS de produção indisponível.",
  };
}

function normalizeSignatureHeader(value: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  if (lowered.startsWith("sha256=")) return raw.slice(7).trim();
  return raw;
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** HMAC-SHA256 do corpo em bruto; formato `sha256=<hex>` ou hex puro. */
export async function verifyEmisWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): Promise<boolean> {
  const expected = normalizeSignatureHeader(input.signatureHeader);
  if (!expected || input.secret.length < 16 || !input.rawBody) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input.rawBody));
  return timingSafeEqualHex(hexFromBuffer(mac), expected.toLowerCase());
}
