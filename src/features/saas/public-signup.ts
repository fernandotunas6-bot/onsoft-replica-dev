import { provisionTenantCore } from "@/features/saas/provisioning-core";
import type { PublicSchoolSignupInput } from "@/features/saas/schemas";
import { checkRateLimit, isRateLimitBypassed, recordRateLimitAttempt } from "@/lib/rate-limit";

const SIGNUP_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };

function checkSignupRateLimit(...keys: string[]): boolean {
  if (isRateLimitBypassed(...keys)) return true;
  return checkRateLimit(keys, SIGNUP_RATE_LIMIT);
}

function recordSignupAttempt(...keys: string[]): void {
  recordRateLimitAttempt(keys, SIGNUP_RATE_LIMIT);
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
  adminPasswordSet: boolean;
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
