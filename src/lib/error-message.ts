/**
 * Mensagem de um erro apanhado num `catch` (que é `unknown`): usa a `message`
 * de um `Error` ou de qualquer objecto que a tenha (os erros do Supabase e das
 * server functions nem sempre são `Error`); sem mensagem, devolve `fallback`.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}
