import { readLocalBlob } from "./local-store";
import type { SchoolFileRecord } from "./schemas";
import { signSchoolFile } from "./server";

/** Obtém URL para abrir ou pré-visualizar — só quando o utilizador precisa do ficheiro. */
export async function resolveFileUrl(file: SchoolFileRecord): Promise<string> {
  if (file.storageBackend === "local") {
    const blob = await readLocalBlob(file.id);
    if (!blob) throw new Error("Ficheiro local não encontrado neste dispositivo.");
    return URL.createObjectURL(blob);
  }
  const signed = await signSchoolFile({ data: { id: file.id } });
  if (signed.url) return signed.url;
  const blob = await readLocalBlob(file.id);
  if (blob) return URL.createObjectURL(blob);
  throw new Error("Não foi possível abrir o ficheiro.");
}

export async function resolveFileBlob(file: SchoolFileRecord): Promise<Blob> {
  if (file.storageBackend === "local") {
    const blob = await readLocalBlob(file.id);
    if (!blob) throw new Error("Ficheiro local não encontrado neste dispositivo.");
    return blob;
  }
  const signed = await signSchoolFile({ data: { id: file.id } });
  if (signed.url) {
    const response = await fetch(signed.url);
    if (!response.ok) throw new Error("Não foi possível descarregar o ficheiro.");
    return response.blob();
  }
  const blob = await readLocalBlob(file.id);
  if (blob) return blob;
  throw new Error("Não foi possível abrir o ficheiro.");
}

export function isImageFileKind(kind: SchoolFileRecord["kind"]) {
  return kind === "png" || kind === "jpeg" || kind === "webp" || kind === "gif";
}
