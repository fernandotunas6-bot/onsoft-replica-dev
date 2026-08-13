import { z } from "zod";

export const listDirectThreadInputSchema = z.object({
  peerId: z.string().uuid(),
  limit: z.number().int().min(10).max(200).default(80),
});
export type ListDirectThreadInput = z.infer<typeof listDirectThreadInputSchema>;

export const sendDirectMessageInputSchema = z
  .object({
    peerId: z.string().uuid(),
    body: z.string().trim().max(2000).optional(),
    attachmentFileId: z.string().uuid().optional(),
    attachmentFileName: z.string().trim().max(255).optional(),
  })
  .refine((value) => Boolean(value.body?.trim()) || Boolean(value.attachmentFileId), {
    message: "Escreva uma mensagem ou anexe um arquivo.",
    path: ["body"],
  });
export type SendDirectMessageInput = z.infer<typeof sendDirectMessageInputSchema>;

export type InboxPreview = {
  peerId: string;
  full_name: string;
  avatar_url: string | null;
  /** Última mensagem em qualquer direcção — usada para pré-visualização e ordenação. */
  lastActivityAt: string;
  lastBody: string;
  /** Só mensagens recebidas — usada para calcular não-lidas. null se nunca recebeu. */
  lastIncomingAt: string | null;
};
