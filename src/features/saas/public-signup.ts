import { provisionTenantCore } from "@/features/saas/provisioning-core";
import type { PublicSchoolSignupInput } from "@/features/saas/schemas";
import { isRateLimitBypassed } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/shared-rate-limit";

const SIGNUP_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };

/**
 * Criar uma escola cria tenant, escola e conta de administrador: o limite é
 * partilhado entre instâncias (siga_rate_limit_consume), não por instância.
 */
async function consumeSignupRateLimit(...keys: string[]): Promise<boolean> {
  if (isRateLimitBypassed(...keys)) return true;
  return consumeRateLimit(keys, SIGNUP_RATE_LIMIT);
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
  adminExistingAccount: boolean;
  /** Entrada directa no SIGA com sessão; só existe quando a senha foi definida neste registo. */
  adminLoginUrl: string | null;
}> {
  const { website: _honeypot, ...wizardData } = data;
  const emailKey = wizardData.contact_email.trim().toLowerCase();
  const rateLimitKeys = [`ip:${ip}`, `email:${emailKey}`];
  if (!(await consumeSignupRateLimit(...rateLimitKeys))) {
    throw new Error(
      "Muitos pedidos recentes a partir deste e-mail/IP. Tente novamente daqui a algumas horas.",
    );
  }

  const result = await provisionTenantCore(
    { ...wizardData, trial_days: 14 },
    { auditUserId: null, source: "public_signup" },
  );
  // `hostname` vem já resolvido por getPlatformSubdomain() — não repetir aqui
  // o domínio da plataforma (regra do app-config: um único ponto de verdade).
  const { adminSetupUrl: _setupUrl, ...publicResult } = result;
  return publicResult;
}
