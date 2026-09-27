/**
 * Mensagens para a política de senhas do Supabase Auth.
 *
 * Com a protecção contra senhas expostas activa (Auth → Password security),
 * o Supabase recusa em `signUp` e `updateUser` qualquer senha que apareça em
 * fugas de dados conhecidas (HaveIBeenPwned), e também as que não cumprem o
 * tamanho ou os caracteres exigidos. O erro vem com `code: "weak_password"` e
 * `reasons` ("length", "characters", "pwned"). No início de sessão a pessoa
 * entra na mesma, mas a resposta traz `weakPassword` com as mesmas razões.
 */

type Reason = "length" | "characters" | "pwned" | string;

/** Senha nova recusada por aparecer em fugas de dados. */
export const PWNED_PASSWORD_MESSAGE =
  "Esta senha aparece em fugas de dados conhecidas. Escolha outra que não use noutros sites.";

/** Aviso a quem acabou de entrar com uma senha exposta. */
export const PWNED_SIGN_IN_NOTICE =
  "A sua senha aparece em fugas de dados conhecidas. Altere-a agora.";

function reasonsOf(value: unknown): Reason[] | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { code?: unknown; name?: unknown; reasons?: unknown };
  const weak =
    candidate.code === "weak_password" ||
    candidate.name === "AuthWeakPasswordError" ||
    Array.isArray(candidate.reasons);
  if (!weak) return null;
  return Array.isArray(candidate.reasons) ? (candidate.reasons as Reason[]) : [];
}

function messageFor(reasons: Reason[]): string {
  if (reasons.includes("pwned")) return PWNED_PASSWORD_MESSAGE;
  if (reasons.includes("length")) {
    return "A senha é demasiado curta. Use pelo menos 8 caracteres.";
  }
  if (reasons.includes("characters")) {
    return "A senha precisa de letras maiúsculas e minúsculas, números e símbolos.";
  }
  return "A senha não cumpre a política de segurança. Escolha uma senha mais forte.";
}

/** Mensagem para um erro de senha fraca, ou `null` se o erro for outro. */
export function passwordPolicyMessage(error: unknown): string | null {
  const reasons = reasonsOf(error);
  return reasons ? messageFor(reasons) : null;
}

/**
 * Aviso depois de entrar com uma senha que já não cumpre a política
 * (`data.weakPassword` de `signInWithPassword`), ou `null` se não houver.
 */
export function weakSignInPasswordNotice(weakPassword: unknown): string | null {
  const reasons = reasonsOf(
    weakPassword && typeof weakPassword === "object"
      ? { ...(weakPassword as object), code: "weak_password" }
      : null,
  );
  if (!reasons) return null;
  if (reasons.includes("pwned")) return PWNED_SIGN_IN_NOTICE;
  return "A sua senha já não cumpre a política de segurança. Altere-a agora.";
}
