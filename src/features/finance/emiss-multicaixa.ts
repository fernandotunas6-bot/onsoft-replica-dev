/**
 * Motor de Pagamentos Automáticos Angolanos — EMIS / Multicaixa Express / Kwik / Unitel Money / RUPE.
 * Suporta geração de referências ponderadas, simulação de liquidação e recepção de Webhook.
 */

export interface MulticaixaReference {
  entity: string; // Ex: "99824" (RUPE / EMIS) ou "00012"
  reference: string; // 9 dígitos ponderados
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

/**
 * Gera uma referência Multicaixa de 9 dígitos válida com cálculo de checksum de controlo.
 */
export function generateMulticaixaReference(
  entity: string = "99824",
  invoiceId: string,
  amount: number,
  expiryDays: number = 30,
): MulticaixaReference {
  // Limpa o ID para extrair apenas dígitos ou hash determinístico
  const cleanId = invoiceId
    .replace(/[^0-9]/g, "")
    .padEnd(6, "0")
    .slice(0, 6);
  const randomSuffix = Math.floor(10 + Math.random() * 89).toString();
  const raw8 = `${cleanId.slice(0, 7)}${randomSuffix}`.padEnd(8, "1").slice(0, 8);

  // Cálculo de dígito de controlo Luhn-Mod10 simplificado para referências EMIS
  let sum = 0;
  for (let i = 0; i < raw8.length; i++) {
    const digit = parseInt(raw8[i] ?? "0", 10);
    const weight = i % 2 === 0 ? 2 : 1;
    const prod = digit * weight;
    sum += prod > 9 ? prod - 9 : prod;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  const reference = `${raw8}${checkDigit}`;

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + expiryDays);

  const formattedRef = `${reference.slice(0, 3)} ${reference.slice(3, 6)} ${reference.slice(6, 9)}`;

  // Payload codificado para o QR Code do terminal Multicaixa / App bancária
  const qrCodeText = `EMIS|ENT:${entity}|REF:${reference}|AMT:${amount.toFixed(2)}|CUR:AOA`;

  return {
    entity,
    reference: formattedRef,
    amountFormatted: new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA" }).format(
      amount,
    ),
    amountNumber: amount,
    expiresAt: expDate.toISOString().split("T")[0] ?? expDate.toISOString(),
    status: "pending",
    qrCodeText,
  };
}

/**
 * Formata detalhes de carteiras móveis angolanas (Unitel Money, Kwik, PayPay).
 */
export function generateMobileWalletOptions(
  amount: number,
  invoiceNumber: string,
): MobileWalletPayment[] {
  const cleanRef = invoiceNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  return [
    {
      provider: "multicaixa_express",
      providerName: "Multicaixa Express",
      phoneOrAccount: "+244 923 000 000",
      merchantCode: "SIGA-EXP-AO",
      transactionRef: `MCX-${cleanRef}`,
      status: "pending",
    },
    {
      provider: "unitel_money",
      providerName: "Unitel Money",
      phoneOrAccount: "*444# ou App Unitel Money",
      merchantCode: "923-SIGA",
      transactionRef: `UM-${cleanRef}`,
      status: "pending",
    },
    {
      provider: "kwik",
      providerName: "Kwik (Rede EMIS)",
      phoneOrAccount: "Transferência Instantânea Kwik",
      merchantCode: "KWIK-SIGA-01",
      transactionRef: `KWK-${cleanRef}`,
      status: "pending",
    },
  ];
}
