import { useEffect, useId, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listChatConversations } from "@/features/messages/chat-server";
import type { ChatConversation } from "@/features/messages/chat-schemas";
import { supabase } from "@/integrations/supabase/client";

export const chatSummaryQueryKey = (userId: string) => ["messages", "chat-summary", userId];

export type ChatUnreadRow = {
  conversationId: string;
  peerId: string | null;
  full_name: string;
  avatar_url: string | null;
  lastBody: string;
  unread: number;
};

/** Conversas com mensagens por ler, pela ordem da mais recente. */
export function chatUnreadRows(conversations: ChatConversation[]): ChatUnreadRow[] {
  return conversations
    .filter((conversation) => conversation.unread > 0)
    .sort((a, b) => (b.messages.at(-1)?.ts ?? 0) - (a.messages.at(-1)?.ts ?? 0))
    .map((conversation) => {
      const last = conversation.messages.at(-1);
      return {
        conversationId: conversation.id,
        peerId: conversation.peerId,
        full_name: conversation.name,
        avatar_url: conversation.avatarUrl,
        lastBody: last?.deleted ? "Mensagem apagada" : (last?.text ?? ""),
        unread: conversation.unread,
      };
    });
}

/**
 * Não lidas para o sino, o avatar da conta e a lista de colegas — a partir do
 * chat (`siga_chat_*`), que é onde as mensagens vivem desde 2026-10-02.
 *
 * Antes contava só a tabela antiga `siga_direct_messages`, onde já ninguém
 * escrevia (as 24 mensagens dela foram copiadas para o chat): as mensagens do
 * chat nunca chegavam ao sino, e as antigas ficavam por ler para sempre, porque
 * só o ecrã antigo, já fora de uso, as marcava como lidas.
 */
export function useInboxUnread() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const instanceId = useId();
  const queryKey = useMemo(() => chatSummaryQueryKey(currentUser.id), [currentUser.id]);

  const summaryQuery = useQuery({
    queryKey,
    enabled: Boolean(currentUser.id),
    queryFn: async () => (await listChatConversations()).conversations,
    staleTime: 15_000,
    retry: false,
  });

  useEffect(() => {
    if (!currentUser.id) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey });
    // A RLS só entrega as mensagens das conversas de que a conta é membro, e
    // a leitura própria muda `siga_chat_members` (abrir a conversa no chat).
    const channel = supabase
      .channel(`chat_unread_${currentUser.id}_${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "siga_chat_messages" },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "siga_chat_members",
          filter: `user_id=eq.${currentUser.id}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, instanceId, queryClient, queryKey]);

  const conversations = useMemo(() => summaryQuery.data ?? [], [summaryQuery.data]);
  const unread = useMemo(() => chatUnreadRows(conversations), [conversations]);
  const unreadIds = useMemo(
    () => new Set(unread.map((row) => row.peerId).filter((id): id is string => Boolean(id))),
    [unread],
  );
  /** Última mensagem de cada conversa directa, pela pessoa. */
  const lastBodyByPeer = useMemo(() => {
    const map = new Map<string, string>();
    for (const conversation of conversations) {
      const last = conversation.messages.at(-1);
      if (conversation.peerId && last && !last.deleted) map.set(conversation.peerId, last.text);
    }
    return map;
  }, [conversations]);

  return {
    summaryQuery,
    unread,
    unreadIds,
    unreadCount: unread.length,
    lastBodyByPeer,
  };
}
