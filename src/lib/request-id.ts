/**
 * Identificador de correlação de cada chamada a uma server function.
 *
 * O browser gera um UUID por chamada e envia-o no cabeçalho
 * `x-siga-request-id`; o servidor (`src/server.ts`) aceita-o se for um UUID,
 * ou gera outro, e usa-o nos logs (`ops-report.ts`) e na auditoria
 * (`metadata.correlation_id`). Quando a chamada falha, o erro leva o mesmo ID
 * e o aviso mostra os primeiros 8 caracteres: é o que a escola diz ao suporte
 * para se encontrar o pedido nos registos.
 *
 * Não identifica pessoas nem dá acesso a nada; serve só para correlacionar.
 */
export const REQUEST_ID_HEADER = "x-siga-request-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O ID enviado pelo browser, se for válido; nunca texto livre nos logs. */
export function acceptRequestId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return UUID.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

const ERROR_KEY = "correlationId";

/** Liga o ID ao erro sem mudar a mensagem (as regras de `error-guidance` dependem dela). */
export function tagErrorWithRequestId(error: unknown, requestId: string): void {
  if (error == null || typeof error !== "object") return;
  try {
    Object.defineProperty(error, ERROR_KEY, {
      value: requestId,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Erro congelado: segue sem referência.
  }
}

/** Referência curta para mostrar ao utilizador, ou `undefined`. */
export function requestReferenceOf(error: unknown): string | undefined {
  if (error == null || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[ERROR_KEY];
  return typeof value === "string" && value ? value.slice(0, 8).toUpperCase() : undefined;
}
