import { provisionTenantCore } from "@/features/saas/provisioning-core";
import type { PublicSchoolSignupInput } from "@/features/saas/schemas";
import { isRateLimitBypassed } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import {
  isReservedTestEmail,
  isSignupEmailVerificationRequired,
  verifySignupVerificationToken,
} from "@/features/saas/signup-verification";
import { markLeadCompleted } from "@/features/saas/commercial-lifecycle";

export const EMAIL_NOT_VERIFIED_MESSAGE =
  "Confirme o e-mail do administrador com o código que lhe enviámos antes de criar a escola.";
import { verifyHcaptcha } from "@/lib/hcaptcha-verify.server";

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
  const {
    website: _honeypot,
    email_verification_token: verificationToken,
    session_id: sessionId,
    captcha_token: captchaToken,
    ...wizardData
  } = data;
  // Prova de posse do e-mail antes de gastar o limite de pedidos e de escrever
  // o que quer que seja: sem ela, qualquer pessoa criava uma conta confirmada
  // com o e-mail de outra.
  if (
    isSignupEmailVerificationRequired() &&
    !isReservedTestEmail(wizardData.admin_email) &&
    !verifySignupVerificationToken(verificationToken, wizardData.admin_email)
  ) {
    throw new Error(EMAIL_NOT_VERIFIED_MESSAGE);
  }
  const emailKey = wizardData.contact_email.trim().toLowerCase();
  const rateLimitKeys = [`ip:${ip}`, `email:${emailKey}`];
  if (!(await consumeSignupRateLimit(...rateLimitKeys))) {
    throw new Error(
      "Muitos pedidos recentes a partir deste e-mail/IP. Tente novamente daqui a algumas horas.",
    );
  }

  // Depois do limite (que trava a repetição barata), antes de criar seja o que for.
  if (!(await verifyHcaptcha(captchaToken, ip))) {
    throw new Error("Confirme que não é um robô e tente de novo.");
  }

  const result = await provisionTenantCore(
    { ...wizardData, trial_days: 14 },
    { auditUserId: null, source: "public_signup" },
  );
  // `hostname` vem já resolvido por getPlatformSubdomain() — não repetir aqui
  // o domínio da plataforma (regra do app-config: um único ponto de verdade).
  await markLeadCompleted({ sessionId, email: wizardData.admin_email, tenantId: result.tenantId });
  const { adminSetupUrl: _setupUrl, ...publicResult } = result;
  return publicResult;
}
