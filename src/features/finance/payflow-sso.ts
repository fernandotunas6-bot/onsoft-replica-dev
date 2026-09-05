/**
 * Asserções SSO SIGA → PayFlow (HMAC-SHA256 JWT).
 * Deve permanecer alinhado com painel/payflow/lib/sso-assertion.ts.
 */

export const payflowAdminRoles = ["finance_admin", "treasurer", "cashier", "auditor"] as const;
export type PayflowAdminRole = (typeof payflowAdminRoles)[number];

export type PayflowSsoClaims = {
  iss: "siga-plus";
  aud: "payflow";
  sub: string;
  tenant_id: string;
  school_id: string;
  role: PayflowAdminRole;
  name?: string;
  iat: number;
  exp: number;
  jti: string;
};

function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export function mapSigaRoleToPayflowAdmin(
  appRole: string,
): PayflowAdminRole | null {
  if (appRole === "Administrador") return "finance_admin";
  if (appRole === "Tesouraria") return "treasurer";
  if (appRole === "Secretaria") return "auditor";
  return null;
}

export async function createPayflowSsoAssertion(claims: PayflowSsoClaims, secret: string) {
  if (secret.length < 32) {
    throw new Error("PAYFLOW_SSO_SECRET deve ter pelo menos 32 caracteres.");
  }
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: "siga-payflow-v1" }));
  const payload = encodeBase64Url(JSON.stringify(claims));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${encodeBase64Url(await sign(unsigned, secret))}`;
}

export function buildPayflowSsoClaims(input: {
  userId: string;
  tenantId: string;
  schoolId: string;
  role: PayflowAdminRole;
  name?: string;
  now?: number;
}): PayflowSsoClaims {
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  const jti = `jti_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  return {
    iss: "siga-plus",
    aud: "payflow",
    sub: input.userId,
    tenant_id: input.tenantId,
    school_id: input.schoolId,
    role: input.role,
    name: input.name,
    iat: nowSeconds,
    exp: nowSeconds + 60,
    jti,
  };
}
