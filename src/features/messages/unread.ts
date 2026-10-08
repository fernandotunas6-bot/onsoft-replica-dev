export const OPEN_DM_EVENT = "siga:open-dm";

/** Pedido ao separador «Mensagens» (RightRail) para abrir uma conversa: pela
 *  pessoa (conversa directa, criada se não existir) ou pela conversa em si
 *  (o sino de notificações já sabe qual é, e um grupo não tem pessoa). */
export type OpenConversationRequest = { peerId?: string; conversationId?: string };

export function requestOpenDirectMessage(peerId: string) {
  if (typeof window === "undefined" || !peerId) return;
  window.dispatchEvent(new CustomEvent(OPEN_DM_EVENT, { detail: { peerId } }));
}

export function requestOpenConversation(conversationId: string) {
  if (typeof window === "undefined" || !conversationId) return;
  window.dispatchEvent(new CustomEvent(OPEN_DM_EVENT, { detail: { conversationId } }));
}
