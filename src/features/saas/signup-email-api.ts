/**
 * Registo público — confirmação do e-mail e progresso do assistente WEB /start.
 * Lógica das rotas `/api/saas/signup/*`, separada para ser testada sem HTTP.
 */
import { z } from "zod";
import { OtpDispatcher } from "@/features/otp/otp-dispatcher";
import { OtpService } from "@/features/otp/otp-service";
import { getAppName } from "@/lib/app-config";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import { issueSignupVerificationToken } from "./signup-verification";
import { markLeadEmailVerified, recordSignupProgress } from "./commercial-lifecycle";
import { planCodeSchema } from "./schemas";

const email = z.string().trim().toLowerCase().email("Indique um e-mail válido.");
const sessionId = z.string().uuid().optional();

export const signupEmailCodeInputSchema = z.object({ email, session_id: sessionId });

export const signupEmailVerifyInputSchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "O código tem 6 dígitos."),
  session_id: sessionId,
  contact_name: z.string().trim().max(160).optional(),
  contact_phone: z.string().trim().max(40).optional(),
  school_name: z.string().trim().max(160).optional(),
  plan_code: planCodeSchema.optional(),
});

export const signupProgressInputSchema = z.object({
  session_id: z.string().uuid(),
  step: z.number().int().min(1).max(7),
  plan_code: planCodeSchema.optional(),
  school_name: z.string().trim().max(160).optional(),
});

export type ApiResult = { status: number; body: Record<string, unknown> };

export async function requestSignupEmailCode(input: unknown, ip: string): Promise<ApiResult> {
  const parsed = signupEmailCodeInputSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: "Indique um e-mail válido." } };
  const result = await new OtpDispatcher().requestOtp({
    targetIdentifier: parsed.data.email,
    purpose: "signup_verification",
    preferredChannel: "email",
    schoolName: getAppName(),
    requestedIp: ip,
  });
  if (!result.success) {
    return {
      status: result.cooldownSeconds > 0 ? 429 : 502,
      body: {
        error: result.error || "Não foi possível enviar o código. Tente de novo.",
        cooldownSeconds: result.cooldownSeconds,
      },
    };
  }
  return { status: 200, body: { sent: true, cooldownSeconds: result.cooldownSeconds } };
}

const VERIFY_MESSAGES: Record<string, string> = {
  expired: "O código expirou. Peça um novo.",
  too_many_attempts: "Demasiadas tentativas. Peça um novo código.",
  not_found: "Peça primeiro o código para este e-mail.",
  invalid_code: "Código incorrecto. Confirme os 6 dígitos.",
};

export async function verifySignupEmailCode(input: unknown, ip: string): Promise<ApiResult> {
  const parsed = signupEmailVerifyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: parsed.error.issues[0]?.message ?? "Pedido inválido." },
    };
  }
  // Além das 5 tentativas por código: trava tentativas em massa a partir do mesmo IP.
  if (
    ip !== "unknown" &&
    !(await consumeRateLimit([`signup_verify:${ip}`], { windowMs: 3_600_000, max: 30 }))
  ) {
    return { status: 429, body: { error: "Demasiadas tentativas. Tente mais tarde." } };
  }
  const verification = await OtpService.verifyCode({
    targetIdentifier: parsed.data.email,
    purpose: "signup_verification",
    code: parsed.data.code,
  });
  if (!verification.valid) {
    return {
      status: 400,
      body: {
        error:
          VERIFY_MESSAGES[verification.reason ?? "invalid_code"] ?? VERIFY_MESSAGES.invalid_code,
        attemptsLeft: verification.attemptsLeft ?? null,
      },
    };
  }
  await markLeadEmailVerified({
    sessionId: parsed.data.session_id ?? null,
    email: parsed.data.email,
    contactName: parsed.data.contact_name ?? null,
    contactPhone: parsed.data.contact_phone ?? null,
    schoolName: parsed.data.school_name ?? null,
    planCode: parsed.data.plan_code ?? null,
  }).catch(() => undefined);
  return {
    status: 200,
    body: { verified: true, token: issueSignupVerificationToken(parsed.data.email) },
  };
}

export async function recordSignupProgressFromRequest(
  input: unknown,
  ip: string,
): Promise<ApiResult> {
  const parsed = signupProgressInputSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: "Pedido inválido." } };
  if (
    ip !== "unknown" &&
    !(await consumeRateLimit([`signup_progress:${ip}`], { windowMs: 3_600_000, max: 120 }))
  ) {
    return { status: 429, body: { error: "Demasiados pedidos." } };
  }
  await recordSignupProgress({
    sessionId: parsed.data.session_id,
    step: parsed.data.step,
    planCode: parsed.data.plan_code ?? null,
    schoolName: parsed.data.school_name ?? null,
  });
  return { status: 200, body: { ok: true } };
}
