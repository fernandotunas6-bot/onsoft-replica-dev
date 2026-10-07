/*
 * Pedidos para abrir o chat a partir de outros sítios (sino de notificações,
 * painel da conta, botão «Mensagem» numa ficha). O «por ler» vive na base
 * (`siga_chat_members.last_read_at`) — ver `use-chat-unread.ts`.
 */
export const OPEN_DM_EVENT = "siga:open-dm";
export const OPEN_CHAT_EVENT = "siga:open-chat";

/** Abre uma conversa já existente (directa ou de grupo) no chat. */
export function requestOpenConversation(conversationId: string) {
  if (typeof window === "undefined" || !conversationId) return;
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { conversationId } }));
}

export function requestOpenDirectMessage(peerId: string) {
  if (typeof window === "undefined" || !peerId) return;
  window.dispatchEvent(new CustomEvent(OPEN_DM_EVENT, { detail: { peerId } }));
}
