/**
 * Mensagens do login da consola em português. O Supabase Auth responde em inglês
 * («Invalid login credentials», «Email not confirmed»…) e o formulário mostrava o
 * texto tal como vinha.
 */
const BY_CODE: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorrectos.",
  email_not_confirmed: "Confirme primeiro o e-mail desta conta (veja a caixa de entrada).",
  user_banned: "Esta conta está bloqueada. Contacte a equipa SIGA Plus.",
  over_request_rate_limit: "Demasiadas tentativas. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit: "Demasiados e-mails pedidos. Aguarde alguns minutos.",
  captcha_failed: "A verificação anti-robô falhou. Recarregue a página e tente de novo.",
};

const BY_MESSAGE: Array<[RegExp, string]> = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/rate limit|too many requests/i, BY_CODE.over_request_rate_limit],
  [
    /failed to fetch|network|load failed/i,
    "Sem ligação ao servidor. Verifique a internet e tente de novo.",
  ],
];

export const ADMIN_SIGN_IN_FALLBACK = "Não foi possível entrar. Tente de novo.";

export function adminSignInErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return ADMIN_SIGN_IN_FALLBACK;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && BY_CODE[code]) return BY_CODE[code];
  const status = (error as { status?: unknown }).status;
  if (status === 429) return BY_CODE.over_request_rate_limit;
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string") {
    for (const [pattern, text] of BY_MESSAGE) if (pattern.test(message)) return text;
  }
  return ADMIN_SIGN_IN_FALLBACK;
}
