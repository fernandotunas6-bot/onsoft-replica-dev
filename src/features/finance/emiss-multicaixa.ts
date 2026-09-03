import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Referências EMIS/Multicaixa determinísticas.
 *
 * Production invariant:
 * - não existe entidade EMIS de fallback;
 * - não existem números de telefone, merchant codes ou carteiras simuladas;
 * - sem configuração real, a funcionalidade deve falhar fechada.
 */

/** Mantido apenas por compatibilidade de import. Nunca usar como entidade real. */
export const DEFAULT_EMIS_ENTITY: null = null;

/** Lê entidade EMIS real do config de integração. */
export function emisEntityFromIntegrationConfig(
  config: Record<string, unknown> | null | undefined,
): string | null {
  const raw = String(config?.emisEntity ?? config?.merchantId ?? "").trim();
  return /^\d{4,6}$/.test(raw) ? raw : null;
}

/** Entidade EMIS configurada em Integrações → Multicaixa. */
export async function resolveSchoolEmisEntity(db: SupabaseClient, schoolId: string) {
  const { data } = await db
    .from("school_integrations")
    .select("config")
    .eq("school_id", schoolId)
    .eq("provider", "multicaixa_express")
    .in("status", ["configured", "connected"])
    .maybeSingle();

  return emisEntityFromIntegrationConfig((data?.config ?? {}) as Record<string, unknown>);
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
 * Gera referência Multicaixa estável quando existe entidade EMIS real.
 * Nunca fabrica uma entidade de teste.
 */
export function generateMulticaixaReference(
  entity: string,
  invoiceId: string,
  amount: number,
  expiryDays: number = 30,
): MulticaixaReference {
  if (!/^\d{4,6}$/.test(entity)) {
    throw new Error("Entidade EMIS não configurada.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montante inválido para referência Multicaixa.");
  }

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
    qrCodeText: `EMIS|ENT:${entity}|REF:${referenceDigits}|AMT:${amount.toFixed(2)}|CUR:AOA`,
  };
}

/**
 * Legacy API kept for compatibility.
 * Provider options must now come from real school_integrations configuration.
 */
export function generateMobileWalletOptions(
  _amount: number,
  _invoiceNumber: string,
): MobileWalletPayment[] {
  return [];
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
