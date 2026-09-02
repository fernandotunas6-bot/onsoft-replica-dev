import { z } from "zod";
import { validateAngolaPhone } from "@/lib/angola-phone";

export const updateCurrentProfileInputSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z
    .string()
    .trim()
    .max(24)
    .optional()
    .refine((value) => !value || validateAngolaPhone(value).ok, {
      message: "Telefone inválido. Use +244 9XX XXX XXX.",
    }),
  // O PostgREST devolve timestamptz com offset ("+00:00"), não com "Z" — sem
  // { offset: true } o Zod rejeita sempre o updated_at real do Supabase.
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export type UpdateCurrentProfileInput = z.infer<typeof updateCurrentProfileInputSchema>;

const avatarStoragePathSchema = z
  .string()
  .regex(/^[0-9a-f-]{36}\/avatar-[0-9]{13}\.(png|jpg|jpeg|webp)$/i, "Caminho de avatar inválido.");

export const setCurrentProfileAvatarInputSchema = z.object({
  storagePath: avatarStoragePathSchema,
});

export type SetCurrentProfileAvatarInput = z.infer<typeof setCurrentProfileAvatarInputSchema>;

export const signProfileAvatarInputSchema = z.object({
  avatarUrl: z.string().trim().min(1).max(800),
});
