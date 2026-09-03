/** IBAN Angola: AO + 2 dígitos de controlo + 21 dígitos BBAN. */
export const ANGOLA_IBAN_REGEX = /^AO\d{23}$/;

export function normalizeAngolaIban(value: string) {
  return value.trim().toUpperCase().replace(/\s/g, "");
}

export function formatAngolaIban(value: string) {
  const compact = normalizeAngolaIban(value);
  if (!ANGOLA_IBAN_REGEX.test(compact)) return value.trim();
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

function ibanMod97(iban: string) {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (let index = 0; index < rearranged.length; index += 1) {
    const code = rearranged.charCodeAt(index);
    const chunk = code >= 48 && code <= 57 ? rearranged[index] : String(code - 55);
    remainder = Number(`${remainder}${chunk}`) % 97;
  }
  return remainder;
}

export function validateAngolaIban(value: string):
  | { ok: true; compact: string; formatted: string }
  | { ok: false; error: string } {
  const compact = normalizeAngolaIban(value);
  if (compact.length !== 25) {
    return { ok: false, error: "O IBAN angolano deve ter 25 caracteres." };
  }
  if (!ANGOLA_IBAN_REGEX.test(compact)) {
    return { ok: false, error: "O IBAN deve começar por AO e conter 23 dígitos." };
  }
  if (ibanMod97(compact) !== 1) {
    return { ok: false, error: "Os dígitos de controlo do IBAN são inválidos." };
  }
  return { ok: true, compact, formatted: formatAngolaIban(compact) };
}

export function maskIban(value: string) {
  const compact = normalizeAngolaIban(value);
  return compact.length >= 8 ? `${compact.slice(0, 4)} •••• •••• •••• •${compact.slice(-4)}` : "••••";
}
