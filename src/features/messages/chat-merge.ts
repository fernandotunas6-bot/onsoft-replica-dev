import type { ChatConversation, ChatMessage } from "./chat-schemas";

/** Mensagens que só existem no browser: ainda a enviar, ou falhadas à espera de reenvio. */
export function isLocalOnly(message: ChatMessage): boolean {
  return message.status === "sending" || message.status === "failed";
}

/**
 * Junta a lista de conversas que veio do servidor com o que o ecrã já tem.
 *
 * O servidor devolve cada conversa só com a última mensagem. Substituir a lista
 * inteira (como se fazia a cada mensagem recebida) apagava o histórico da
 * conversa aberta e as mensagens ainda a enviar, e voltava a mostrar como não
 * lidas as da conversa que a pessoa estava a ler.
 */
export function mergeConversations(
  previous: ChatConversation[],
  fresh: ChatConversation[],
  activeId: string | null,
): ChatConversation[] {
  const byId = new Map(previous.map((conversation) => [conversation.id, conversation]));
  return fresh.map((conversation) => {
    const old = byId.get(conversation.id);
    const unread = conversation.id === activeId ? 0 : conversation.unread;
    if (!old?.loaded) {
      return { ...conversation, unread, online: old?.online ?? conversation.online };
    }
    // A pré-visualização do servidor pode ser mais recente do que o que está
    // carregado (chegou entretanto): entra no fim, se ainda não lá estiver.
    const latest = conversation.messages.at(-1);
    const known = new Set(old.messages.map((message) => message.id));
    const hasLatest =
      !latest ||
      known.has(latest.id) ||
      old.messages.some((message) => !isLocalOnly(message) && message.ts >= latest.ts);
    return {
      ...conversation,
      unread,
      online: old.online ?? conversation.online,
      loaded: true,
      more: old.more,
      messages: hasLatest ? old.messages : [...old.messages, latest],
    };
  });
}

/**
 * Mensagens carregadas do servidor mais as que ainda só existem no browser —
 * recarregar a conversa não pode fazer desaparecer o que se está a enviar.
 */
export function withLocalMessages(
  serverMessages: ChatMessage[],
  current: ChatMessage[],
): ChatMessage[] {
  const pending = current.filter(isLocalOnly);
  return pending.length ? [...serverMessages, ...pending] : serverMessages;
}

/** Texto de erro de uma server function, ou o genérico quando não serve à pessoa. */
export function chatErrorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || message.length > 160 || /^[A-Z_]+$/.test(message)) return fallback;
  if (/fetch|network|unauthorized|status code|json/i.test(message)) return fallback;
  return message;
}
