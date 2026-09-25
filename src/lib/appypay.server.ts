/**
 * Cliente AppyPay (gateway angolano: Multicaixa Express/GPO e Referência/REF).
 * Docs: https://appypay.stoplight.io/docs/appypay-payment-gateway
 * Segredos (só servidor): APPYPAY_CLIENT_ID, APPYPAY_CLIENT_SECRET, APPYPAY_RESOURCE,
 * APPYPAY_GPO_METHOD (ex.: GPO_xxx), APPYPAY_REF_METHOD (ex.: REF_xxx),
 * APPYPAY_ENV ("sandbox" | "production"), APPYPAY_WEBHOOK_TOKEN.
 */

export type AppyPayMethod = "GPO" | "REF";

export type AppyPayCharge = {
  id: string;
  merchantTransactionId: string;
  amount: number;
  status: string;
  successful: boolean;
  message: string | null;
  referenceEntity: string | null;
  referenceNumber: string | null;
  raw: Record<string, unknown>;
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function appyPayConfigured() {
  return Boolean(
    env("APPYPAY_CLIENT_ID") &&
      env("APPYPAY_CLIENT_SECRET") &&
      env("APPYPAY_RESOURCE") &&
      (env("APPYPAY_GPO_METHOD") || env("APPYPAY_REF_METHOD")),
  );
}

function isProd() {
  return env("APPYPAY_ENV") === "production";
}

function apiBase() {
  return isProd() ? "https://gwy-api.appypay.co.ao/v2.0" : "https://gwy-api-tst.appypay.co.ao/v2.0";
}

function tokenUrl() {
  return isProd()
    ? "https://login.microsoftonline.com/auth.appypay.co.ao/oauth2/token"
    : "https://login.microsoftonline.com/appypaydev.onmicrosoft.com/oauth2/token";
}

async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env("APPYPAY_CLIENT_ID"),
    client_secret: env("APPYPAY_CLIENT_SECRET"),
    resource: env("APPYPAY_RESOURCE"),
  });
  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !json.access_token) {
    throw new Error("A AppyPay recusou as credenciais. Confirme o Client ID e o Client Secret.");
  }
  return json.access_token;
}

function normalize(raw: Record<string, unknown>): AppyPayCharge {
  const rs = (raw["responseStatus"] ?? {}) as Record<string, unknown>;
  const ref = ((rs["reference"] ?? raw["reference"]) ?? {}) as Record<string, unknown>;
  return {
    id: String(raw["id"] ?? ""),
    merchantTransactionId: String(raw["merchantTransactionId"] ?? ""),
    amount: Number(raw["amount"] ?? 0),
    status: String(rs["status"] ?? raw["status"] ?? "Pending"),
    successful: rs["successful"] === true,
    message: (rs["message"] as string) ?? null,
    referenceEntity: ref["entity"] != null ? String(ref["entity"]) : null,
    referenceNumber: ref["referenceNumber"] != null ? String(ref["referenceNumber"]) : null,
    raw,
  };
}

export async function createAppyPayCharge(input: {
  method: AppyPayMethod;
  amount: number;
  merchantTransactionId: string;
  description: string;
  phoneNumber?: string;
}): Promise<AppyPayCharge> {
  const methodId = input.method === "GPO" ? env("APPYPAY_GPO_METHOD") : env("APPYPAY_REF_METHOD");
  if (!methodId) throw new Error(`O método ${input.method} não está configurado na AppyPay.`);
  const token = await accessToken();
  const res = await fetch(`${apiBase()}/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Assíncrono: a AppyPay responde 202 e confirma pelo webhook.
      Accept: "application/vnd.appypay.asyncapi+json",
      "Accept-Language": "pt-BR",
    },
    body: JSON.stringify({
      amount: Math.round(input.amount * 100) / 100,
      currency: "AOA",
      description: input.description.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 60),
      merchantTransactionId: input.merchantTransactionId,
      paymentMethod: methodId,
      ...(input.method === "GPO" ? { paymentInfo: { phoneNumber: input.phoneNumber } } : {}),
      notify: {},
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok && res.status !== 202) {
    const rs = (json["responseStatus"] ?? {}) as Record<string, unknown>;
    throw new Error(String(rs["message"] ?? json["message"] ?? "A AppyPay recusou a cobrança."));
  }
  return normalize(json);
}

/** Confirmação obrigatória: o webhook não é assinado, por isso consultamos sempre a AppyPay. */
export async function getAppyPayCharge(id: string): Promise<AppyPayCharge | null> {
  const token = await accessToken();
  const res = await fetch(`${apiBase()}/charges/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Não foi possível confirmar a cobrança na AppyPay.");
  return normalize((await res.json()) as Record<string, unknown>);
}

export function newMerchantTransactionId() {
  // Máx. 15 caracteres alfanuméricos.
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `S${t}${r}`.replace(/[^A-Z0-9]/g, "").slice(0, 15);
}
