import { z } from "zod";
import { validateAngolaPhone } from "@/lib/angola-phone";

export const updateCurrentProfileInputSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z
    .string()
    .trim()
    .max(24)
    .optional()
    .refine((value) => !value || validateAngolaPhone(value).ok, {
      message: "Telefone inválido. Use +244 9XX XXX XXX.",
    }),
  expectedUpdatedAt: z.string().datetime(),
});

export type UpdateCurrentProfileInput = z.infer<typeof updateCurrentProfileInputSchema>;
