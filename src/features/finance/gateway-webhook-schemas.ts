import { z } from "zod";
import { normalizePaymentReference } from "@/features/finance/emiss-multicaixa";

/**
 * Corpo do aviso EMIS/Unitel. A key da escola já não vem aqui: o pedido é
 * assinado (`gateway-webhook-signature.ts`). `externalId` — o identificador da
 * transacção no provedor — é obrigatório: é a chave que impede liquidar duas vezes.
 */
export const gatewayConfirmInputSchema = z.object({
  reference: z.string().trim().min(5).max(160),
  amount: z.number().positive(),
  invoiceId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  entity: z.string().trim().max(20).optional(),
  channel: z
    .enum(["multicaixa", "express", "multicaixa_express", "unitel_money"])
    .default("multicaixa_express"),
  externalId: z.string().trim().min(6).max(120),
});

export type GatewayConfirmInput = z.infer<typeof gatewayConfirmInputSchema>;

export function referencesMatch(stored: string | null | undefined, incoming: string) {
  if (!stored) return false;
  return normalizePaymentReference(stored) === normalizePaymentReference(incoming);
}
