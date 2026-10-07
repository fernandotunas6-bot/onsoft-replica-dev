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

type WindowRow = {
  conversation_id: string;
  sender_id: string;
  deleted_at?: string | null;
  created_at: string;
};

/**
 * Por ler a partir da janela das mensagens mais recentes da escola (servidor).
 *
 * A janela vem ordenada da mais recente para a mais antiga e tem no máximo
 * `limit` linhas. Quando enche, as conversas cujo «lido» é anterior à linha mais
 * antiga da janela podem ter mensagens por ler fora dela: essas vão em
 * `needsExactCount` para uma contagem exacta, e as que não aparecem na janela
 * em `missingLast` para irem buscar a última mensagem.
 */
export function planChatUnread(input: {
  rows: WindowRow[];
  limit: number;
  conversationIds: string[];
  readAtById: Map<string, string>;
  userId: string;
}) {
  const { rows, limit, conversationIds, readAtById, userId } = input;
  const unreadByConv = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of rows) {
    const cid = String(row.conversation_id);
    seen.add(cid);
    const readAt = Date.parse(readAtById.get(cid) ?? "");
    if (
      String(row.sender_id) !== userId &&
      !row.deleted_at &&
      (Number.isNaN(readAt) || Date.parse(row.created_at) > readAt)
    ) {
      unreadByConv.set(cid, (unreadByConv.get(cid) ?? 0) + 1);
    }
  }

  const truncated = rows.length >= limit && rows.length > 0;
  const cutoff = truncated ? Date.parse(rows[rows.length - 1]!.created_at) : -Infinity;
  const needsExactCount = new Set<string>();
  const missingLast: string[] = [];
  if (truncated) {
    for (const cid of conversationIds) {
      const readAt = Date.parse(readAtById.get(cid) ?? "");
      if (Number.isNaN(readAt) || cutoff > readAt) needsExactCount.add(cid);
      if (!seen.has(cid)) missingLast.push(cid);
    }
  }
  return { unreadByConv, needsExactCount, missingLast };
}
