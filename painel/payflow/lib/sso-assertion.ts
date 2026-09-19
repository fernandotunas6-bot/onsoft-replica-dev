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

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return new Uint8Array([...binary].map((character) => character.charCodeAt(0)));
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

function safeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

function isClaims(value: unknown): value is PayflowSsoClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Partial<PayflowSsoClaims>;
  return (
    claims.iss === "siga-plus" &&
    claims.aud === "payflow" &&
    typeof claims.sub === "string" &&
    claims.sub.length >= 3 &&
    typeof claims.tenant_id === "string" &&
    claims.tenant_id.length >= 3 &&
    typeof claims.school_id === "string" &&
    claims.school_id.length >= 3 &&
    payflowAdminRoles.includes(claims.role as PayflowAdminRole) &&
    typeof claims.iat === "number" &&
    typeof claims.exp === "number" &&
    typeof claims.jti === "string" &&
    claims.jti.length >= 12
  );
}

export async function createSsoAssertion(claims: PayflowSsoClaims, secret: string) {
  if (secret.length < 32) throw new Error("PAYFLOW_SSO_SECRET deve ter pelo menos 32 caracteres.");
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: "siga-payflow-v1" }));
  const payload = encodeBase64Url(JSON.stringify(claims));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${encodeBase64Url(await sign(unsigned, secret))}`;
}

export async function verifySsoAssertion(assertion: string, secret: string, now = Date.now()) {
  if (secret.length < 32) return null;
  const parts = assertion.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;

  try {
    const parsedHeader = JSON.parse(new TextDecoder().decode(decodeBase64Url(header))) as {
      alg?: unknown;
      typ?: unknown;
      kid?: unknown;
    };
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT" || parsedHeader.kid !== "siga-payflow-v1") {
      return null;
    }
    const expected = await sign(`${header}.${payload}`, secret);
    if (!safeEqual(expected, decodeBase64Url(signature))) return null;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as unknown;
    if (!isClaims(claims)) return null;
    const nowSeconds = Math.floor(now / 1000);
    if (claims.iat > nowSeconds + 30 || claims.exp <= nowSeconds) return null;
    if (claims.exp - claims.iat > 120 || claims.exp <= claims.iat) return null;
    return claims;
  } catch {
    return null;
  }
}
