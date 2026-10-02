/**
 * Prova de posse do e-mail no registo público de escolas.
 *
 * Antes, o registo criava a conta do administrador já confirmada para qualquer
 * e-mail escrito no formulário. Quem registasse uma escola com o e-mail de
 * outra pessoa ficava com uma conta dessa pessoa — e, se ela entrasse depois
 * com o Google, o Supabase ligava a identidade Google a essa conta, que o
 * primeiro continuava a abrir com a senha que escolheu.
 *
 * Agora o assistente pede um código de 6 dígitos enviado para o e-mail (serviço
 * de OTP existente, propósito `signup_verification`). Com o código certo o
 * servidor devolve um comprovativo assinado — e-mail + validade — que o pedido
 * de registo tem de trazer. É sem estado: não há tabela de sessões de registo.
 *
 * A chave de assinatura deriva da chave de serviço do Supabase (só existe no
 * servidor, e existe sempre em produção): não é preciso configurar nada novo,
 * e sem ela o comprovativo não se consegue emitir nem validar.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Validade do comprovativo: o resto do assistente cabe folgadamente em 2 h. */
export const SIGNUP_VERIFICATION_TTL_MS = 2 * 60 * 60 * 1000;

function signingKey(): Buffer {
  const base =
    process.env["SUPABASE_SECRET_KEY"]?.trim() || process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!base) throw new Error("Verificação de e-mail indisponível: servidor sem chave de serviço.");
  return createHmac("sha256", base).update("siga:signup-email-verification:v1").digest();
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

/** Desligável só por configuração explícita (testes E2E, ambiente local). */
export function isSignupEmailVerificationRequired(): boolean {
  const flag = process.env["SIGNUP_EMAIL_VERIFICATION"]?.trim().toLowerCase();
  return flag !== "off" && flag !== "false" && flag !== "0";
}

/**
 * Domínios reservados (RFC 2606 / RFC 6761): nunca têm caixas de correio reais,
 * logo não há dono a proteger nem código que se possa receber. São os que os
 * testes E2E usam (`e2e+…@siga-plus.test`).
 */
export function isReservedTestEmail(email: string): boolean {
  return /\.(test|example|invalid|localhost)$/i.test(email.trim());
}

export function issueSignupVerificationToken(email: string, now = Date.now()): string {
  const payload = b64url(
    JSON.stringify({ e: email.trim().toLowerCase(), x: now + SIGNUP_VERIFICATION_TTL_MS }),
  );
  const signature = b64url(createHmac("sha256", signingKey()).update(payload).digest());
  return `v1.${payload}.${signature}`;
}

/** true só para um comprovativo íntegro, dentro da validade e do mesmo e-mail. */
export function verifySignupVerificationToken(
  token: string | undefined | null,
  email: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [version, payload, signature] = token.split(".");
  if (version !== "v1" || !payload || !signature) return false;
  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      e?: unknown;
      x?: unknown;
    };
    return (
      typeof data.e === "string" &&
      data.e === email.trim().toLowerCase() &&
      typeof data.x === "number" &&
      data.x > now
    );
  } catch {
    return false;
  }
}

/** Assinatura para a ligação «deixar de receber lembretes» de um registo. */
export function leadUnsubscribeSignature(leadId: string): string {
  return b64url(createHmac("sha256", signingKey()).update(`unsubscribe:${leadId}`).digest()).slice(
    0,
    32,
  );
}

export function verifyLeadUnsubscribeSignature(leadId: string, signature: string): boolean {
  const expected = Buffer.from(leadUnsubscribeSignature(leadId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
