/** Tipo de imagem decidido pelos primeiros bytes do ficheiro.
 *
 * O `type` de um `File` vem do cliente e não prova nada: um ficheiro qualquer
 * pode chegar anunciado como `image/png`. Aqui olha-se para a assinatura e é
 * ela que decide o `Content-Type` guardado no R2 e, mais tarde, o que o
 * browser recebe de volta.
 */
export type ImageKind = { contentType: string; extension: string };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF = [0x47, 0x49, 0x46, 0x38];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/** `null` quando o conteúdo não é uma imagem aceite. */
export function detectImageKind(bytes: Uint8Array, allowSvg = false): ImageKind | null {
  if (startsWith(bytes, PNG)) return { contentType: 'image/png', extension: 'png' };
  if (startsWith(bytes, JPEG)) return { contentType: 'image/jpeg', extension: 'jpg' };
  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  // GIF não é aceite, mas distinguir ajuda a mensagem de erro.
  if (startsWith(bytes, GIF)) return null;
  if (allowSvg && isSvg(bytes)) return { contentType: 'image/svg+xml', extension: 'svg' };
  return null;
}

/** SVG é texto: procura-se a raiz `<svg` no início, saltando BOM e espaços. */
function isSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false })
    .decode(bytes.subarray(0, 512))
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (!head.startsWith('<')) return false;
  const withoutPrologue = head
    .replace(/^<\?xml[^>]*\?>/, '')
    .replace(/^<!DOCTYPE[^>]*>/i, '')
    .trimStart();
  return withoutPrologue.toLowerCase().startsWith('<svg');
}
