import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  type AttachmentType,
} from "@/features/academic/task-attachments";

export type PreparedAttachment = {
  name: string;
  contentType: AttachmentType;
  base64: string;
  sizeBytes: number;
};

/** Fotos acima disto são reduzidas: a foto de um caderno lê-se bem a 1800 px. */
const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;
const MAX_SIDE = 1800;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o ficheiro."));
    reader.readAsDataURL(blob);
  });
}

/** Reduz uma foto para JPEG; sem suporte no navegador, devolve null e envia-se o original. */
async function shrinkPhoto(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82),
    );
  } catch {
    return null;
  }
}

/** Confere o tipo, reduz fotos grandes e converte para o envio. */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const type = file.type as AttachmentType;
  if (!ATTACHMENT_TYPES.includes(type)) {
    throw new Error("Envie um PDF ou uma foto (JPG, PNG, WebP).");
  }
  let blob: Blob = file;
  let contentType: AttachmentType = type;
  let name = file.name;
  if (type !== "application/pdf" && file.size > SHRINK_ABOVE_BYTES) {
    const shrunk = await shrinkPhoto(file);
    if (shrunk && shrunk.size < file.size) {
      blob = shrunk;
      contentType = "image/jpeg";
      name = name.replace(/\.[^.]*$/, "") + ".jpg";
    }
  }
  if (blob.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("O anexo deve ter no máximo 5 MB.");
  }
  return { name, contentType, base64: await toBase64(blob), sizeBytes: blob.size };
}
