export function isOpaqueSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function decodeJwtPayload(payload: string): string | undefined {
  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(padded);
  }
  // Node/SSR: atob may be unavailable depending on runtime.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }
  return undefined;
}

function legacyJwtRole(value: string): string | undefined {
  const payload = value.split(".")[1];
  if (!payload) return undefined;

  try {
    const decoded = decodeJwtPayload(payload);
    if (!decoded) return undefined;
    const parsed = JSON.parse(decoded) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : undefined;
  } catch {
    return undefined;
  }
}

export function assertPublishableSupabaseKey(value: string, variableName: string) {
  const role = legacyJwtRole(value);
  if (value.startsWith("sb_publishable_") || role === "anon") return;

  const reason =
    value.startsWith("sb_secret_") || role === "service_role"
      ? "contains an elevated Supabase key"
      : "does not contain a recognised Supabase publishable key";
  throw new Error(`${variableName} ${reason}. Use a publishable key or legacy anon key.`);
}

export function assertSecretSupabaseKey(value: string, variableName: string) {
  const role = legacyJwtRole(value);
  if (value.startsWith("sb_secret_") || role === "service_role") return;

  const reason =
    value.startsWith("sb_publishable_") || role === "anon"
      ? "contains a public Supabase key"
      : "does not contain a recognised Supabase secret key";
  throw new Error(`${variableName} ${reason}. Use a secret key or legacy service_role key.`);
}
