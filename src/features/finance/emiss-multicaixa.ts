import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Referências EMIS/Multicaixa determinísticas (mesma fatura → mesma referência).
 * Confirmação automática via POST /api/finance/gateway/confirm quando o EMIS
 * (ou simulador) notifica o SIGA com a API key da escola.
 */

/** Entidade configurada, ou `null` — nunca a entidade de exemplo. */
export function configuredEmisEntity(config: Record<string, unknown> | null | undefined) {
  const raw = String(config?.emisEntity ?? config?.merchantId ?? "").trim();
  return /^\d{4,6}$/.test(raw) ? raw : null;
}

/**
 * Entidade EMIS da escola, só se estiver configurada em Integrações →
 * Multicaixa. Uma referência com outra entidade podia levar um encarregado a
 * pagar a quem não é a escola.
 */
export async function resolveConfiguredSchoolEmisEntity(db: SupabaseClient, schoolId: string) {
  const { data } = await db
    .from("school_integrations")
    .select("config")
    .eq("school_id", schoolId)
    .eq("provider", "multicaixa_express")
    .in("status", ["configured", "connected"])
    .maybeSingle();
  return configuredEmisEntity((data?.config ?? {}) as Record<string, unknown>);
}

export interface MulticaixaReference {
  entity: string;
  reference: string;
  amountFormatted: string;
  amountNumber: number;
  expiresAt: string;
  status: "pending" | "paid" | "expired";
  qrCodeText: string;
}

export interface MobileWalletPayment {
  provider: "unitel_money" | "paypay" | "kwik" | "multicaixa_express";
  providerName: string;
  phoneOrAccount: string;
  merchantCode: string;
  transactionRef: string;
  status: "pending" | "completed" | "failed";
}

/** Remove espaços — comparação entre UI, webhook e base de dados. */
export function normalizePaymentReference(value: string) {
  return value.replace(/\s+/g, "");
}

function hashInvoiceSeed(invoiceId: string) {
  let hash = 2166136261;
  for (let i = 0; i < invoiceId.length; i += 1) {
    hash ^= invoiceId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function emisCheckDigit(raw8: string) {
  let sum = 0;
  for (let i = 0; i < raw8.length; i += 1) {
    const digit = Number.parseInt(raw8[i] ?? "0", 10);
    const weight = i % 2 === 0 ? 2 : 1;
    const prod = digit * weight;
    sum += prod > 9 ? prod - 9 : prod;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Gera referência Multicaixa de 9 dígitos estável para a mesma fatura.
 */
export function generateMulticaixaReference(
  /** Entidade configurada pela escola — nunca uma entidade de exemplo. */
  entity: string,
  invoiceId: string,
  amount: number,
  expiryDays: number = 30,
): MulticaixaReference {
  const digits = invoiceId.replace(/\D/g, "");
  const seed = hashInvoiceSeed(invoiceId);
  const raw8 = `${digits.padEnd(4, "0").slice(0, 4)}${String(seed % 10000).padStart(4, "0")}`.slice(
    0,
    8,
  );
  const checkDigit = emisCheckDigit(raw8);
  const referenceDigits = `${raw8}${checkDigit}`;
  const formattedRef = `${referenceDigits.slice(0, 3)} ${referenceDigits.slice(3, 6)} ${referenceDigits.slice(6, 9)}`;

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + expiryDays);

  const qrCodeText = `EMIS|ENT:${entity}|REF:${referenceDigits}|AMT:${amount.toFixed(2)}|CUR:AOA`;

  return {
    entity,
    reference: formattedRef,
    amountFormatted: new Intl.NumberFormat("pt-AO", {
      style: "currency",
      currency: "AOA",
    }).format(amount),
    amountNumber: amount,
    expiresAt: expDate.toISOString().split("T")[0] ?? expDate.toISOString(),
    status: "pending",
    qrCodeText,
  };
}

export const GATEWAY_CHANNELS = new Set([
  "multicaixa",
  "express",
  "multicaixa_express",
  "unitel_money",
]);

export function isGatewayPaymentChannel(channel: string) {
  return GATEWAY_CHANNELS.has(channel);
}
