/**
 * Mensagens para a política de senhas do Supabase Auth.
 *
 * O Supabase recusa em `signUp` e `updateUser` as senhas que não cumprem o
 * tamanho ou os caracteres exigidos, com `code: "weak_password"` e `reasons`
 * ("length", "characters"). No início de sessão a pessoa entra na mesma, mas a
 * resposta traz `weakPassword` com as mesmas razões.
 *
 * O motivo "pwned" (senha em fugas conhecidas, via HaveIBeenPwned) continua
 * tratado abaixo, mas **hoje não chega a acontecer**: essa protecção exige plano
 * Pro e a organização está no free. O tratamento fica para quando houver.
 */

/**
 * A política configurada no Supabase Auth (Auth → Password security), replicada
 * aqui para a interface poder verificar antes de submeter. Até 25/10/2026 cada
 * ecrã tinha a sua versão: o de reposição calculava `hasSpecial` e **esquecia-se
 * de o exigir**, e nenhum pedia maiúsculas e minúsculas em separado. O servidor
 * recusava e a pessoa levava o erro depois de submeter, em vez do visto na lista.
 *
 * Mudar aqui obriga a mudar lá — e o inverso. São os mesmos requisitos que as
 * mensagens abaixo prometem.
 */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordChecks = {
  length: boolean;
  lower: boolean;
  upper: boolean;
  number: boolean;
};

/** Cada requisito em separado, para desenhar a lista de verificação. */
export function passwordChecksOf(password: string): PasswordChecks {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
  };
}

/** `true` quando a senha cumpre tudo o que o servidor vai exigir. */
export function passwordMeetsPolicy(password: string): boolean {
  return Object.values(passwordChecksOf(password)).every(Boolean);
}

/** Texto único para quando a senha não cumpre — usado nos avisos imediatos. */
export const PASSWORD_POLICY_HINT =
  "A senha precisa de pelo menos 8 caracteres, com maiúsculas, minúsculas e números.";

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
    return "A senha precisa de letras maiúsculas e minúsculas e de números.";
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
