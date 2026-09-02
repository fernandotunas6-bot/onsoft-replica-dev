/** Referência EMIS determinística — partilhada pelo simulador CLI e testes. */

export function hashInvoiceSeed(invoiceId) {
  let hash = 2166136261;
  for (let i = 0; i < invoiceId.length; i += 1) {
    hash ^= invoiceId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function emisCheckDigit(raw8) {
  let sum = 0;
  for (let i = 0; i < raw8.length; i += 1) {
    const digit = Number.parseInt(raw8[i] ?? "0", 10);
    const weight = i % 2 === 0 ? 2 : 1;
    const prod = digit * weight;
    sum += prod > 9 ? prod - 9 : prod;
  }
  return (10 - (sum % 10)) % 10;
}

/** Espelha generateMulticaixaReference (9 dígitos, sem espaços). */
export function referenceDigitsForInvoice(invoiceId) {
  const digits = invoiceId.replace(/\D/g, "");
  const seed = hashInvoiceSeed(invoiceId);
  const raw8 = `${digits.padEnd(4, "0").slice(0, 4)}${String(seed % 10000).padStart(4, "0")}`.slice(
    0,
    8,
  );
  const checkDigit = emisCheckDigit(raw8);
  return `${raw8}${checkDigit}`;
}
