const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';

export function createTempPassword(length = 16) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);

  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }

  return password;
}
