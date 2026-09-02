import { z } from "zod";
import { normalizePaymentReference } from "@/features/finance/emiss-multicaixa";

export const gatewayConfirmInputSchema = z.object({
  apiKey: z.string().trim().min(8).max(200),
  reference: z.string().trim().min(5).max(160),
  amount: z.number().positive(),
  invoiceId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  entity: z.string().trim().max(20).optional(),
  channel: z
    .enum(["multicaixa", "express", "multicaixa_express", "unitel_money"])
    .default("multicaixa_express"),
  externalId: z.string().trim().max(120).optional(),
});

export type GatewayConfirmInput = z.infer<typeof gatewayConfirmInputSchema>;

export function referencesMatch(stored: string | null | undefined, incoming: string) {
  if (!stored) return false;
  return normalizePaymentReference(stored) === normalizePaymentReference(incoming);
}
