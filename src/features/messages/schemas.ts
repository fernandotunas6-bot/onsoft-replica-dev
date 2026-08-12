import { z } from "zod";

export const listDirectThreadInputSchema = z.object({
  peerId: z.string().uuid(),
  limit: z.number().int().min(10).max(200).default(80),
});
export type ListDirectThreadInput = z.infer<typeof listDirectThreadInputSchema>;

export const sendDirectMessageInputSchema = z.object({
  peerId: z.string().uuid(),
  body: z.string().trim().min(1, "Escreva uma mensagem.").max(2000),
});
export type SendDirectMessageInput = z.infer<typeof sendDirectMessageInputSchema>;

export type InboxPreview = {
  peerId: string;
  full_name: string;
  avatar_url: string | null;
  lastIncomingAt: string;
  lastBody: string;
};
