/**
 * Comparação de strings em tempo constante — evita que um atacante infira
 * caracteres de uma chave secreta (API key, token de integração) medindo
 * quanto tempo demora a comparação a falhar. Nunca usar `===`/`!==` para
 * comparar segredos vindos de um pedido HTTP com o valor esperado.
 */
export function timingSafeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
