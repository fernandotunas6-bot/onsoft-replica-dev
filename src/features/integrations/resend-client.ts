/**
 * Cliente HTTP Resend partilhado (escola + alertas de plataforma).
 * Sem API key → o caller faz fallback (clipboard / mailto).
 */

export type ResendSendInput = {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
};

export type ResendSendResult = {
  id: string | null;
  status: number;
};

export function resolveResendFromAddress(callbackOrEmail: string): string {
  const raw = callbackOrEmail.trim();
  if (!raw) return "SIGA Plus <onboarding@resend.dev>";
  if (raw.includes("<") && raw.includes("@")) return raw;
  if (raw.includes("@") && !raw.includes("://")) {
    return raw.includes(" ") ? raw : `SIGA Plus <${raw}>`;
  }
  const host = raw
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    ?.trim();
  if (host && host.includes(".")) {
    return `SIGA Plus <noreply@${host}>`;
  }
  return "SIGA Plus <onboarding@resend.dev>";
}

/** merchantId = API key; callbackUrl = from / domínio. Env fallback opcional. */
export function resolveResendCredentials(
  config: Record<string, unknown>,
  envApiKey?: string | null,
): { apiKey: string; from: string } | null {
  const apiKey =
    String(config.merchantId ?? config.apiKey ?? config.webhookApiKey ?? "").trim() ||
    String(envApiKey ?? "").trim();
  if (!apiKey) return null;
  const from = resolveResendFromAddress(
    String(config.callbackUrl ?? config.from ?? config.fromEmail ?? ""),
  );
  return { apiKey, from };
}

export function normalizeResendRecipients(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
    if (out.length >= 50) break;
  }
  return out;
}

export async function sendResendEmail(input: ResendSendInput): Promise<ResendSendResult> {
  const to = normalizeResendRecipients(input.to);
  if (!to.length) throw new Error("Indique pelo menos um destinatário de e-mail.");
  if (!input.apiKey.trim()) throw new Error("API key Resend em falta.");

  const body: Record<string, unknown> = {
    from: input.from,
    to,
    subject: input.subject,
  };
  if (input.html) body.html = input.html;
  if (input.text) body.text = input.text;
  if (!input.html && !input.text) {
    body.text = input.subject;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };
  if (!res.ok) {
    const detail = payload.message || payload.name || `HTTP ${res.status}`;
    throw new Error(`Resend: ${detail}`);
  }
  return { id: payload.id ?? null, status: res.status };
}
