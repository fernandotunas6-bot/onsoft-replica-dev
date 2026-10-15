const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';

/** Sem caracteres que se confundem ao ditar ou copiar à mão (0/O, 1/l/I). */
const HANDOUT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Senha temporária por pessoa, entregue pela secretaria e trocada no primeiro
 * acesso. 12 caracteres de 55 possíveis ≈ 69 bits. Usa rejeição para não
 * favorecer caracteres (o módulo simples enviesava a distribuição).
 */
export function createHandoutPassword(length = 12) {
  const out: string[] = [];
  const limit = Math.floor(256 / HANDOUT_ALPHABET.length) * HANDOUT_ALPHABET.length;
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(HANDOUT_ALPHABET[b % HANDOUT_ALPHABET.length]);
    }
  }
  return out.join('');
}

export function createTempPassword(length = 16) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);

  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }

  return password;
}
