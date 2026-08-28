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
