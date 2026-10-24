import { z } from "zod";

export const listChatMessagesInputSchema = z.object({
  conversationId: z.string().guid(),
  limit: z.number().int().min(10).max(200).default(60),
  /** ISO. Devolve as mensagens anteriores a esta data — "carregar anteriores". */
  before: z.string().datetime().optional(),
});

export const sendChatMessageInputSchema = z
  .object({
    conversationId: z.string().guid(),
    body: z.string().trim().max(4000).optional(),
    replyTo: z.string().guid().optional(),
    attachmentFileId: z.string().guid().optional(),
    attachmentFileName: z.string().trim().max(255).optional(),
  })
  .refine((value) => Boolean(value.body?.trim()) || Boolean(value.attachmentFileId), {
    message: "Escreva uma mensagem ou anexe um arquivo.",
    path: ["body"],
  });

export const deleteChatMessageInputSchema = z.object({ messageId: z.string().guid() });
export const conversationInputSchema = z.object({ conversationId: z.string().guid() });
export const startDirectInputSchema = z.object({ peerId: z.string().guid() });

/** Tipos que a UI consome. `type` reproduz os filtros do painel (Turmas, Responsáveis). */
export type ChatConversationType = "group" | "guardian" | "student" | "staff";

export type ChatMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export type ChatMessage = {
  id: string;
  ts: number;
  text: string;
  /** "me" quando é do próprio; caso contrário o nome de quem enviou. */
  from: string;
  status: ChatMessageStatus;
  deleted: boolean;
  replyTo: { id: string; from: string; text: string } | null;
  file: { name: string; size: number; fileId: string } | null;
};

export type ChatConversation = {
  id: string;
  type: ChatConversationType;
  name: string;
  sub: string;
  peerId: string | null;
  avatarUrl: string | null;
  unread: number;
  online?: boolean;
  student?: { id: string; name?: string };
  messages: ChatMessage[];
  /** Conversa directa com quem já saiu da escola: só para leitura. */
  peerLeft?: boolean;
  /** Há mais mensagens para trás do que as carregadas. */
  more?: boolean;
  loaded?: boolean;
};

export type ChatContact = {
  id: string;
  name: string;
  sub: string;
  avatarUrl: string | null;
};
