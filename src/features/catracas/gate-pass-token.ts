/**
 * Helpers puros para tokens de catraca / RFID (sem I/O).
 */

/** Normaliza tag RFID / Wiegand: trim, sem espaços, maiúsculas. */
export function normalizeRfidTag(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * Remove caracteres que partem o filtro PostgREST `.or(...)`.
 * Não altera o significado típico de cartão/barcode/RFID.
 */
export function sanitizeGatePassFilterValue(raw: string): string {
  return raw.trim().replace(/[,()]/g, "");
}

/** Valores a tentar na validação: original + RFID normalizado (se diferente). */
export function gatePassLookupTokens(raw: string): string[] {
  const clean = sanitizeGatePassFilterValue(raw);
  if (!clean) return [];
  const rfid = normalizeRfidTag(clean);
  if (rfid && rfid !== clean) return [clean, rfid];
  return [clean];
}

/** Dígitos de fonte criptográfica (rejeita bytes ≥ 250 para não enviesar). */
function secureDigits(count: number): string {
  let out = "";
  while (out.length < count) {
    for (const byte of crypto.getRandomValues(new Uint8Array(count * 2))) {
      if (byte < 250 && out.length < count) out += String(byte % 10);
    }
  }
  return out;
}

/**
 * Número e código de barras de um cartão novo. A catraca aceita ambos como
 * passe, por isso não podem ser adivinháveis: antes eram 6 dígitos de
 * Math.random (900 mil hipóteses, as mesmas nos dois). Agora 12 dígitos
 * independentes em cada um (10^12).
 */
export function generateAccessCardIdentifiers(year = new Date().getFullYear()) {
  return {
    cardNumber: `CARD-${year}-${secureDigits(12)}`,
    barcode: `STU${year}${secureDigits(12)}`,
  };
}
