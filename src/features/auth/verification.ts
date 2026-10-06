import { supabase } from "@/integrations/supabase/client";
import { isDesktopSessionRuntime } from "@/lib/desktop-session-vault";

/**
 * Formas de provar que é mesmo a pessoa, da mais leve à de recurso:
 *
 * 1. Chave de acesso (passkey): impressão digital, Face ID, Windows Hello ou
 *    PIN do dispositivo. Um toque, resiste a phishing (presa ao domínio).
 * 2. Código da aplicação autenticadora (TOTP): o recurso quando a chave não
 *    está à mão (outro computador, telemóvel perdido).
 * 3. Senha: só para contas sem nenhum dos dois.
 *
 * As duas primeiras elevam a sessão a aal2 e renovam a hora da verificação.
 */

export type VerificationFactors = {
  passkeyId: string | null;
  totpId: string | null;
};

const ROOT_DOMAIN = "portal-siga.com";

/**
 * A chave fica presa a um domínio. Em portal-siga.com e em qualquer subdomínio
 * (escolas, admin, payflow) usa-se o domínio raiz, para a mesma chave servir em
 * todos. Num domínio próprio de escola, fica presa a esse domínio.
 */
export function passkeyRpId(hostname: string): string {
  const host = hostname.toLowerCase();
  if (host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)) return ROOT_DOMAIN;
  return host;
}

function webauthnOptions() {
  return {
    rpId: passkeyRpId(window.location.hostname),
    rpOrigins: [window.location.origin],
  };
}

/** `aal` do token da sessão local (só leitura; quem valida é o servidor). */
export function sessionAal(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const aal = (JSON.parse(atob(padded)) as { aal?: unknown }).aal;
    return typeof aal === "string" ? aal : null;
  } catch {
    return null;
  }
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    // App desktop (Tauri): a origem não é portal-siga.com, por isso o servidor
    // recusaria a chave. Lá vale o código e o cofre nativo com o PIN do posto.
    !isDesktopSessionRuntime() &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

export async function listVerificationFactors(): Promise<VerificationFactors> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return {
    passkeyId: data?.webauthn?.[0]?.id ?? null,
    totpId: data?.totp?.[0]?.id ?? null,
  };
}

/** Mensagem curta para o ecrã quando o browser ou o servidor recusam a chave. */
export function passkeyErrorMessage(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  const message = error instanceof Error ? error.message : "";
  if (name === "NotAllowedError" || /not allowed|cancel|abort|timed out/i.test(message)) {
    return "A confirmação foi cancelada ou expirou. Tente de novo.";
  }
  if (/webauthn.*(disabled|not enabled)|not enabled|mfa_webauthn/i.test(message)) {
    return "As chaves de acesso ainda não estão activas neste servidor. Use o código da aplicação autenticadora.";
  }
  return "Não foi possível confirmar com a chave de acesso. Use o código da aplicação autenticadora.";
}

export async function verifyWithPasskey(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.webauthn.authenticate({
    factorId,
    webauthn: webauthnOptions(),
  });
  if (error) throw error;
}

export async function verifyWithCode(factorId: string, code: string): Promise<void> {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;
  const verified = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verified.error) throw verified.error;
}

/** Senha de novo, para contas sem 2FA: a sessão nova traz a hora da verificação. */
export async function verifyWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Cria uma chave de acesso neste dispositivo; fica logo verificada. */
export async function registerPasskey(): Promise<void> {
  const name = deviceLabel();
  const { error } = await supabase.auth.mfa.webauthn.register({
    friendlyName: `${name} · ${new Date().toLocaleDateString("pt-PT")}`,
    webauthn: webauthnOptions(),
  });
  if (error) throw error;
}

export function deviceLabel(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
) {
  if (/iPhone|iPad/i.test(userAgent)) return "iPhone/iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Mac OS X/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Dispositivo";
}
