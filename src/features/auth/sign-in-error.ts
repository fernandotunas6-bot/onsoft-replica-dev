import { authCaptchaConfigured } from "@/lib/auth-captcha-config";

/**
 * Mensagens seguras para a entrada: erros transitórios de rede/origem não devem
 * ser confundidos com senhas erradas. Não inclui dados de conta nem credenciais.
 */
export const AUTH_TEMPORARILY_UNAVAILABLE =
  "Falha temporária de ligação ao serviço de autenticação. Tente novamente ou alterne entre Wi-Fi e dados móveis. Não precisa de alterar a senha.";

export function mapSignInError(failure: unknown): string {
  const input =
    typeof failure === "string"
      ? { message: failure }
      : failure && typeof failure === "object"
        ? (failure as { message?: unknown; status?: unknown })
        : {};
  const value = typeof input.message === "string" ? input.message.toLowerCase() : "";
  const status = typeof input.status === "number" ? input.status : undefined;

  if (value.includes("captcha")) {
    return authCaptchaConfigured
      ? "Confirme que não é um robô e tente novamente."
      : "A verificação anti-robô está activa no servidor mas não está configurada nesta aplicação. Avise a administração: falta VITE_HCAPTCHA_SITE_KEY.";
  }
  if (value.includes("invalid login credentials") || value.includes("invalid_credentials")) {
    return "Identificador ou senha incorrectos. Confirme os dados e tente novamente.";
  }
  if (value.includes("school_required")) {
    return "Para entrar com o número de aluno, utilize o endereço do portal da sua escola.";
  }
  if (value.includes("email not confirmed")) {
    return "Confirme o email da conta antes de iniciar sessão.";
  }
  if (status === 429 || value.includes("too many requests") || value.includes("rate limit")) {
    return "Demasiadas tentativas. Aguarde um momento e tente outra vez.";
  }

  // 522 (e outros 5xx) é indisponibilidade de gateway/origem, não uma
  // confirmação de credenciais erradas. GoTrue pode fornecer status ou texto.
  if (
    (typeof status === "number" && status >= 500) ||
    /\b(?:502|503|504|520|521|522|523|524)\b/.test(value) ||
    value.includes("network") ||
    value.includes("fetch") ||
    value.includes("connection") ||
    value.includes("timeout") ||
    value.includes("timed out")
  ) {
    return AUTH_TEMPORARILY_UNAVAILABLE;
  }

  // Excepções locais ou códigos desconhecidos não devem ser diagnosticados
  // falsamente como falha da ligação, nem expostos ao utilizador.
  return "Não foi possível iniciar sessão. Tente novamente.";
}
