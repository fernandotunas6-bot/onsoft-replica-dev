import { useEffect, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listChatConversations } from "@/features/messages/chat-server";
import { chatSummaryQueryKey } from "@/features/messages/use-inbox-unread";
import { supabase } from "@/integrations/supabase/client";
import {
  announcementNotice,
  appInBackground,
  createNoticeBatcher,
  isFreshAnnouncementFor,
  isIncomingMessage,
  messageNotice,
  notifyInBackground,
} from "@/lib/desktop-notifications";
import { isTauriDesktop } from "@/lib/desktop-utils";

type Row = Record<string, unknown>;

/**
 * Notificações do sistema na app desktop (Tauri): mensagem nova (só o remetente, nunca
 * o texto) e comunicado publicado que esta conta vê na lista. Só com a app em segundo
 * plano; rajadas juntam-se num aviso. No browser não faz nada.
 *
 * O tempo real só entrega linhas que a conta pode ler (RLS); a regra de quem vê cada
 * comunicado é a mesma da lista (`isFreshAnnouncementFor`).
 */
export function DesktopNotifications() {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const instanceId = useId();
  const userId = account.id;
  const schoolId = account.schoolId;
  const rolesKey = account.roles.join("|");

  useEffect(() => {
    if (!isTauriDesktop() || !userId || !schoolId) return;
    const roles = rolesKey.split("|");
    const announced = new Set<string>();

    // Nome da conversa directa (a outra pessoa); num grupo não se diz quem.
    const senderName = async (conversationId: string) => {
      try {
        const conversations = await queryClient.fetchQuery({
          queryKey: chatSummaryQueryKey(userId),
          queryFn: async () => (await listChatConversations()).conversations,
          staleTime: 0,
        });
        const conversation = conversations.find((row) => row.id === conversationId);
        return conversation && conversation.type !== "group" ? conversation.name : null;
      } catch {
        return null;
      }
    };

    const messages = createNoticeBatcher<Row>((rows) => {
      if (!appInBackground()) return;
      void (async () => {
        const name =
          rows.length === 1 ? await senderName(String(rows[0]!["conversation_id"])) : null;
        const notice = messageNotice(rows.length, name);
        await notifyInBackground(notice.title, notice.body);
      })();
    });
    const announcements = createNoticeBatcher<Row>((rows) => {
      const notice = announcementNotice(rows.length, String(rows[0]?.["title"] ?? ""));
      void notifyInBackground(notice.title, notice.body);
    });

    const channel = supabase
      .channel(`desktop_notifications:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        // As mensagens vivem no chat desde 2026-10-02; `siga_direct_messages`
        // já não recebe nada. A RLS limita às conversas de que a conta é membro.
        { event: "INSERT", schema: "public", table: "siga_chat_messages" },
        (payload) => {
          const row = payload.new as Row;
          if (isIncomingMessage(row, userId)) messages.push(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "school_announcements",
          filter: `school_id=eq.${schoolId}`,
        },
        (payload) => {
          const row = payload.new as Row;
          if (!isFreshAnnouncementFor(row, { userId, roles, now: Date.now() })) return;
          // Publicar e depois editar chega como dois eventos: avisa uma vez.
          const id = String(row["id"]);
          if (announced.has(id)) return;
          announced.add(id);
          announcements.push(row);
        },
      )
      .subscribe();

    return () => {
      messages.dispose();
      announcements.dispose();
      void supabase.removeChannel(channel);
    };
  }, [userId, schoolId, rolesKey, instanceId, queryClient]);

  return null;
}
