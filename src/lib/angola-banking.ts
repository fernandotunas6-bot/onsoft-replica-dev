/** IBAN Angola (ISO 13616 / BNA): AO + 2 dígitos + 21 dígitos = 25 caracteres. */
export const ANGOLA_IBAN_REGEX = /^AO\d{23}$/;

export function normalizeAngolaIban(value: string): string {
  return value.trim().toUpperCase().replace(/\s/g, "");
}

export function formatAngolaIban(value: string): string {
  const compact = normalizeAngolaIban(value);
  if (!ANGOLA_IBAN_REGEX.test(compact)) return value.trim();
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (let index = 0; index < rearranged.length; index += 1) {
    const code = rearranged.charCodeAt(index);
    const chunk = code >= 48 && code <= 57 ? rearranged[index] : String(code - 55);
    remainder = Number(`${remainder}${chunk}`) % 97;
  }
  return remainder;
}

export function validateAngolaIban(value: string): {
  ok: boolean;
  compact?: string;
  formatted?: string;
  error?: string;
} {
  const compact = normalizeAngolaIban(value);
  if (compact.length !== 25) {
    return { ok: false, error: "O IBAN angolano deve ter 25 caracteres (AO + 23 dígitos)." };
  }
  if (!ANGOLA_IBAN_REGEX.test(compact)) {
    return { ok: false, error: "Formato inválido. Exemplo: AO20004430156278343694804" };
  }
  if (ibanMod97(compact) !== 1) {
    return { ok: false, error: "Dígitos de controlo do IBAN incorrectos." };
  }
  return {
    ok: true,
    compact,
    formatted: formatAngolaIban(compact),
  };
}

/** Códigos de banco comerciais frequentes (BNA). */
export const ANGOLA_BANK_CODES: Record<string, string> = {
  "0000": "BNA — Banco Nacional de Angola",
  "0005": "BCI — Banco de Comércio e Indústria",
  "0039": "BCA — Banco Comercial Angolano",
  "0040": "BPC — Banco de Poupança e Crédito",
  "0043": "Banco Sol",
  "0044": "BAI — Banco Angolano de Investimentos",
  "0045": "BE — Banco Económico",
  "0047": "Banco Keve",
  "0051": "BIC — Banco BIC",
  "0052": "BNI — Banco de Negócios Internacional",
  "0055": "Standard Bank Angola",
  "0059": "BMA — Banco Millennium Atlântico",
  "0066": "BFA — Banco de Fomento Angola",
  "0071": "Banco Yetu",
  "0073": "Access Bank Angola",
};

export function angolaBankLabelFromIban(iban: string): string | null {
  const compact = normalizeAngolaIban(iban);
  if (compact.length < 8) return null;
  const bankCode = compact.slice(4, 8);
  return ANGOLA_BANK_CODES[bankCode] ?? null;
}
