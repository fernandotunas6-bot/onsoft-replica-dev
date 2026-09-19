/**
 * Declarações para `gateway-reference.mjs` — o script é JavaScript puro
 * (partilhado entre a CLI de simulação e os testes), mas é importado a partir
 * de TypeScript em `tests/finance/emiss-multicaixa.test.ts`. Sem isto o
 * módulo entrava como `any` implícito.
 */
export function hashInvoiceSeed(invoiceId: string): number;
export function emisCheckDigit(raw8: string): number;
export function referenceDigitsForInvoice(invoiceId: string): string;
