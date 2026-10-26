/**
 * Anexo de uma entrega de trabalho: uma foto do caderno ou um PDF. Puro (sem I/O),
 * partilhado pelo ecrã (antes de enviar) e pelo servidor (antes de guardar).
 *
 * O tipo declarado pelo navegador não chega: o servidor confirma a assinatura dos
 * primeiros bytes, e a extensão do ficheiro guardado vem do tipo, nunca do nome.
 */

export const ATTACHMENT_EXTENSIONS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AttachmentType = keyof typeof ATTACHMENT_EXTENSIONS;

/** O que o ecrã mostra de um anexo (o conteúdo abre por URL assinado, a pedido). */
export type AttachmentInfo = { id: string; name: string; mime: string; sizeBytes: number };
export const ATTACHMENT_TYPES = Object.keys(ATTACHMENT_EXTENSIONS) as AttachmentType[];

/** 5 MB por anexo; o ecrã reduz as fotos antes de as enviar. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** O mesmo limite em base64 (≈ 4/3), para o validador recusar antes de descodificar. */
export const MAX_ATTACHMENT_BASE64 = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Os bytes são mesmo do tipo declarado? */
export function matchesSignature(bytes: Uint8Array, type: AttachmentType): boolean {
  switch (type) {
    case "application/pdf":
      return startsWith(bytes, ascii("%PDF-"));
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/webp":
      return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8);
  }
}

/**
 * Nome para mostrar: sem caminho, sem caracteres de controlo, até 120 caracteres,
 * e sempre com a extensão do tipo real.
 */
export function safeAttachmentName(name: string, type: AttachmentType): string {
  const extension = ATTACHMENT_EXTENSIONS[type];
  const base =
    name
      .split(/[\\/]/)
      .pop()!
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
      .replace(/\.[^.]*$/, "")
      .trim()
      .slice(0, 110) || "trabalho";
  return `${base}.${extension}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
