/**
 * Cliente HTTP SMS via Twilio, para mensagens de texto livre (comunicados de escola).
 *
 * Separado de `src/features/otp/adapters/twilio-sms-adapter.ts`, que é específico para
 * códigos OTP (`OtpPayload` exige `code`/`expiresInMinutes`/`purpose`). Reutiliza a mesma
 * chamada HTTP crua à API do Twilio, sem SDK.
 *
 * Credenciais globais (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER), as
 * mesmas já usadas para OTP -- não há configuração por escola para SMS, ao contrário do
 * WhatsApp Business (`school_integrations`).
 */

export type SmsSendInput = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toE164: string;
  text: string;
};

export type SmsSendResult = {
  messageId: string | null;
  status: number;
};

/** Normaliza telemóvel (AO 9 dígitos → +244…) para E.164. */
export function normalizeSmsToE164(phoneRaw: string): string {
  let digits = phoneRaw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("9")) digits = `244${digits}`;
  return digits ? `+${digits}` : "";
}

export function normalizeSmsRecipients(phones: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of phones) {
    const n = normalizeSmsToE164(raw);
    if (!n || n.length < 10 || n.length > 16 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 50) break;
  }
  return out;
}

export function resolveTwilioCredentials(): {
  accountSid: string;
  authToken: string;
  fromNumber: string;
} | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim() ?? "";
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

export async function sendTwilioSms(input: SmsSendInput): Promise<SmsSendResult> {
  const to = normalizeSmsToE164(input.toE164);
  if (!to || to.length < 10) {
    throw new Error("Número de telemóvel inválido (use E.164, ex. +2449XXXXXXXX).");
  }
  if (!input.accountSid.trim() || !input.authToken.trim() || !input.fromNumber.trim()) {
    throw new Error("Credenciais Twilio em falta.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(input.accountSid)}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: input.fromNumber,
      To: to,
      Body: input.text.slice(0, 1600),
    }).toString(),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    sid?: string;
    message?: string;
  };
  if (!res.ok || !payload.sid) {
    throw new Error(payload.message || `Twilio HTTP ${res.status}`);
  }
  return { messageId: payload.sid, status: res.status };
}
