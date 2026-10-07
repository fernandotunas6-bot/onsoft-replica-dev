import type { ChatConversation } from "./chat-schemas";

export type UnreadConversation = {
  id: string;
  name: string;
  avatarUrl: string | null;
  peerId: string | null;
  unread: number;
  /** Texto da última mensagem, ou «Mensagem apagada». */
  lastText: string;
  lastAt: number;
};

export type ChatUnreadSummary = {
  /** Total de mensagens por ler. */
  unreadCount: number;
  /** Conversas com mensagens por ler, a mais recente primeiro. */
  conversations: UnreadConversation[];
  /** Pessoas com conversa directa por ler (pontos no painel da conta). */
  unreadPeerIds: Set<string>;
  /** Última mensagem de cada conversa directa, por pessoa. */
  lastTextByPeer: Map<string, string>;
};

function lastTextOf(conversation: ChatConversation) {
  const last = conversation.messages.at(-1);
  if (!last) return "";
  if (last.deleted) return "Mensagem apagada";
  const text = last.text.trim();
  return last.from === "me" ? `Você: ${text}` : text;
}

/** Resumo das não lidas a partir da lista de conversas (lógica pura, testada). */
export function summarizeChatUnread(conversations: ChatConversation[]): ChatUnreadSummary {
  const unreadPeerIds = new Set<string>();
  const lastTextByPeer = new Map<string, string>();
  const unread: UnreadConversation[] = [];
  let unreadCount = 0;

  for (const conversation of conversations) {
    const lastText = lastTextOf(conversation);
    if (conversation.peerId) lastTextByPeer.set(conversation.peerId, lastText);
    const count = Math.max(0, conversation.unread || 0);
    if (!count) continue;
    unreadCount += count;
    if (conversation.peerId) unreadPeerIds.add(conversation.peerId);
    unread.push({
      id: conversation.id,
      name: conversation.name,
      avatarUrl: conversation.avatarUrl,
      peerId: conversation.peerId,
      unread: count,
      lastText,
      lastAt: conversation.messages.at(-1)?.ts ?? 0,
    });
  }

  unread.sort((a, b) => b.lastAt - a.lastAt);
  return { unreadCount, conversations: unread, unreadPeerIds, lastTextByPeer };
}
