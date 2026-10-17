import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import {
  listChatContacts,
  listChatConversations,
  listChatMessages,
  markChatRead,
  sendChatMessage,
  startDirectConversation,
} from "@/features/messages/chat-server";
import { mobileRespond } from "@/features/mobile/api-response";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * Mensagens da app móvel, pelas mesmas funções do chat do SIGA: sessão e MFA,
 * escola activa, só membros lêem a conversa, o encarregado só escreve ao
 * pessoal da escola, conversas directas reaproveitadas.
 *
 *   GET                                   conversas
 *   GET  ?contacts=1                      com quem posso começar conversa
 *   GET  ?conversation_id=&before=ISO     mensagens (60; `before` = anteriores)
 *   POST { action: "send", conversation_id, body }
 *   POST { action: "read", conversation_id }
 *   POST { action: "start", peer_id }     → { conversationId }
 */
export const Route = createFileRoute("/api/mobile/chat")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      GET: async ({ request }) =>
        mobileRespond(request, "api/mobile/chat", async () => {
          const url = new URL(request.url);
          const conversationId = url.searchParams.get("conversation_id");
          if (conversationId) {
            const before = url.searchParams.get("before") ?? undefined;
            return listChatMessages({ data: { conversationId, before, limit: 60 } } as never);
          }
          if (url.searchParams.get("contacts") === "1") return listChatContacts();
          return listChatConversations();
        }),
      POST: async ({ request }) =>
        mobileRespond(request, "api/mobile/chat", async () => {
          const body = (await request.json().catch(() => null)) as MobileChatBody | null;
          if (!body || typeof body !== "object") throw new ZodError([]);
          switch (body.action) {
            case "send":
              return sendChatMessage({
                data: { conversationId: body.conversation_id, body: body.body },
              } as never);
            case "read":
              return markChatRead({ data: { conversationId: body.conversation_id } } as never);
            case "start":
              return startDirectConversation({ data: { peerId: body.peer_id } } as never);
            default:
              throw new ZodError([]);
          }
        }),
    },
  },
});

type MobileChatBody = {
  action?: unknown;
  conversation_id?: unknown;
  body?: unknown;
  peer_id?: unknown;
};
