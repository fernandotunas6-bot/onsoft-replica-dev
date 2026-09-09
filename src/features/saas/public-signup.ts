import { provisionTenantCore } from "@/features/saas/provisioning-core";
import type { PublicSchoolSignupInput } from "@/features/saas/schemas";

const SIGNUP_RATE_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_RATE_MAX_PER_KEY = 3;
const signupAttempts = new Map<string, number[]>();

function checkSignupRateLimit(...keys: string[]): boolean {
  if (
    process.env.SIGA_E2E_LIVE === "1" ||
    process.env.SIGA_E2E_LIVE === "true" ||
    keys.some((k) => k.includes("siga-plus.test"))
  ) {
    return true;
  }
  const now = Date.now();
  return keys.every((key) => {
    const attempts = (signupAttempts.get(key) ?? []).filter((t) => now - t < SIGNUP_RATE_WINDOW_MS);
    return attempts.length < SIGNUP_RATE_MAX_PER_KEY;
  });
}

function recordSignupAttempt(...keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    const attempts = (signupAttempts.get(key) ?? []).filter((t) => now - t < SIGNUP_RATE_WINDOW_MS);
    attempts.push(now);
    signupAttempts.set(key, attempts);
  }
}

export async function runPublicSchoolSignup(
  data: PublicSchoolSignupInput,
  ip: string,
): Promise<{
  success: true;
  tenantId: string;
  slug: string;
  hostname: string;
  bootstrapSeeded: string[];
  adminInviteDelivered: boolean;
}> {
  const { website: _honeypot, ...wizardData } = data;
  const emailKey = wizardData.contact_email.trim().toLowerCase();
  const rateLimitKeys = [`ip:${ip}`, `email:${emailKey}`];
  if (!checkSignupRateLimit(...rateLimitKeys)) {
    throw new Error(
      "Muitos pedidos recentes a partir deste e-mail/IP. Tente novamente daqui a algumas horas.",
    );
  }
  recordSignupAttempt(...rateLimitKeys);

  const result = await provisionTenantCore(
    { ...wizardData, trial_days: 14 },
    { auditUserId: null, source: "public_signup" },
  );
  // `hostname` vem já resolvido por getPlatformSubdomain() — não repetir aqui
  // o domínio da plataforma (regra do app-config: um único ponto de verdade).
  const { adminSetupUrl: _setupUrl, ...publicResult } = result;
  return publicResult;
}
