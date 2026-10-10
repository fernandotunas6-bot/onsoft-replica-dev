/**
 * Mensagem de erro para páginas públicas (matrícula, convite, verificação…).
 *
 * As mensagens do SIGA são escritas para o utilizador e passam. As técnicas —
 * configuração do servidor, PostgREST/SQL, falhas de rede, erros de JavaScript —
 * são trocadas por um texto neutro: não dizem nada útil a quem está do lado de
 * fora e revelam como o sistema está montado.
 */
const TECHNICAL =
  /environment variable|supabase|PGRST|schema cache|\bSQL\b|relation |column |violates|fetch failed|Failed to fetch|NetworkError|Unexpected token|is not a function|Cannot read|undefined|Tabela em falta|Connect .* in Lovable/i;

/** Mensagem técnica (servidor, SQL, rede, JavaScript), não escrita para o utilizador. */
export function isTechnicalMessage(message: string): boolean {
  return TECHNICAL.test(message) || /^\s*[[{]/.test(message);
}

export function publicErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || isTechnicalMessage(message)) return fallback;
  return message;
}
