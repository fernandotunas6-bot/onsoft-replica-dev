/**
 * Cliente HTTP WhatsApp Cloud API (Meta).
 * Sem token/phone id → caller usa deep-link wa.me.
 */

export type WhatsAppSendInput = {
  accessToken: string;
  phoneNumberId: string;
  toE164Digits: string;
  text: string;
};

export type WhatsAppSendResult = {
  messageId: string | null;
  status: number;
};

/** merchantId = Phone number ID; token em accessToken / apiKey / webhookApiKey ou callback se não for URL. */
export function resolveWhatsAppCredentials(
  config: Record<string, unknown>,
  envToken?: string | null,
): { phoneNumberId: string; accessToken: string } | null {
  const phoneNumberId = String(config.merchantId ?? config.phoneNumberId ?? "").trim();
  const callback = String(config.callbackUrl ?? "").trim();
  const fromConfig = String(
    config.accessToken ?? config.apiKey ?? config.webhookApiKey ?? "",
  ).trim();
  const fromCallback = callback && !/^https?:\/\//i.test(callback) ? callback : "";
  const accessToken = fromConfig || fromCallback || String(envToken ?? "").trim();
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

/** Normaliza telemóvel (AO 9 dígitos → 244…) para E.164 sem +. */
export function normalizeWhatsAppToDigits(phoneRaw: string): string {
  let digits = phoneRaw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("9")) digits = `244${digits}`;
  return digits;
}

export function normalizeWhatsAppRecipients(phones: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of phones) {
    const n = normalizeWhatsAppToDigits(raw);
    if (!n || n.length < 10 || n.length > 15 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 50) break;
  }
  return out;
}

export async function sendWhatsAppCloudMessage(
  input: WhatsAppSendInput,
): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppToDigits(input.toE164Digits);
  if (!to || to.length < 8) {
    throw new Error("Número WhatsApp inválido (use E.164, ex. 2449XXXXXXXX).");
  }
  if (!input.accessToken.trim() || !input.phoneNumberId.trim()) {
    throw new Error("Credenciais WhatsApp em falta.");
  }

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: input.text.slice(0, 4096) },
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(payload.error?.message || `WhatsApp HTTP ${res.status}`);
  }
  return {
    messageId: payload.messages?.[0]?.id ?? null,
    status: res.status,
  };
}
