import { supabase } from "@/integrations/supabase/client";
import {
  deleteChatMessage,
  listChatContacts,
  listChatConversations,
  listChatMessages,
  markChatRead,
  sendChatMessage,
  startDirectConversation,
} from "./chat-server";
import type { ChatContact, ChatConversation, ChatMessage } from "./chat-schemas";

export type ChatAdapterHandlers = {
  onMessage: (conversationId: string, message: ChatMessage) => void;
  onUpdate: (conversationId: string, message: Partial<ChatMessage> & { id: string }) => void;
  onRead: (conversationId: string, at: number) => void;
  onTyping: (conversationId: string) => void;
  onPresence: (userIds: string[]) => void;
};

export type SigaChatAdapter = ReturnType<typeof createSigaChatAdapter>;

/** Mesmo contrato do supabaseChatAdapter.js do template, mas as escritas passam
 *  pelas server functions do SIGA — é lá que vive a regra de quem pode falar
 *  com quem e o isolamento por escola. O Supabase do browser é usado só para o
 *  tempo real (Realtime respeita a RLS das tabelas siga_chat_*). */
export function createSigaChatAdapter(me: { id: string; name: string }) {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let typingAt = 0;

  return {
    me,

    async listConversations(): Promise<ChatConversation[]> {
      const result = await listChatConversations();
      return result.conversations;
    },

    async listMessages(conversationId: string, limit = 60, beforeTs?: number) {
      return listChatMessages({
        data: {
          conversationId,
          limit,
          before: beforeTs ? new Date(beforeTs).toISOString() : undefined,
        },
      });
    },

    async listContacts(): Promise<ChatContact[]> {
      return listChatContacts();
    },

    async startDirect(peerId: string) {
      const { conversationId } = await startDirectConversation({ data: { peerId } });
      return conversationId;
    },

    async sendMessage(
      conversationId: string,
      payload: {
        text?: string;
        replyTo?: string;
        attachmentFileId?: string;
        attachmentFileName?: string;
      },
    ) {
      return sendChatMessage({
        data: {
          conversationId,
          body: payload.text?.trim() || undefined,
          replyTo: payload.replyTo,
          attachmentFileId: payload.attachmentFileId,
          attachmentFileName: payload.attachmentFileName,
        },
      });
    },

    async deleteMessage(messageId: string) {
      await deleteChatMessage({ data: { messageId } });
    },

    async markRead(conversationId: string) {
      await markChatRead({ data: { conversationId } });
    },

    /** "A escrever…" por broadcast, com travão de 2,5 s — cada tecla premida
     *  não pode virar uma mensagem no canal. */
    setTyping(conversationId: string) {
      if (!channel || Date.now() - typingAt < 2500) return;
      typingAt = Date.now();
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { conversationId, userId: me.id },
      });
    },

    subscribe(handlers: ChatAdapterHandlers) {
      channel = supabase
        .channel("siga-chat", { config: { presence: { key: me.id } } })
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "siga_chat_messages" },
          ({ new: row }) => {
            const inserted = row as { id?: string; conversation_id?: string };
            if (!inserted.conversation_id || !inserted.id) return;
            // A linha crua não traz nome do autor nem a mensagem respondida:
            // quem recebe recarrega a conversa a partir do servidor.
            handlers.onMessage(String(inserted.conversation_id), {
              id: String(inserted.id),
            } as ChatMessage);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "siga_chat_messages" },
          ({ new: row }) => {
            const updated = row as {
              id?: string;
              conversation_id?: string;
              deleted_at?: string | null;
            };
            if (!updated.conversation_id || !updated.id) return;
            handlers.onUpdate(
              String(updated.conversation_id),
              updated.deleted_at
                ? { id: String(updated.id), deleted: true, text: "", file: null }
                : { id: String(updated.id) },
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "siga_chat_members" },
          ({ new: row }) => {
            const member = row as {
              user_id?: string;
              conversation_id?: string;
              last_read_at?: string;
            };
            if (!member.conversation_id || member.user_id === me.id) return;
            handlers.onRead(
              String(member.conversation_id),
              Date.parse(String(member.last_read_at ?? "")) || 0,
            );
          },
        )
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const data = payload as { conversationId?: string; userId?: string };
          if (!data?.conversationId || data.userId === me.id) return;
          handlers.onTyping(String(data.conversationId));
        })
        .on("presence", { event: "sync" }, () => {
          handlers.onPresence(Object.keys(channel?.presenceState() ?? {}));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void channel?.track({ at: Date.now() });
        });

      return () => {
        if (channel) void supabase.removeChannel(channel);
        channel = null;
      };
    },
  };
}
