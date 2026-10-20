import type { SchoolFileRecord } from "./schemas";

/**
 * Contrato do File Picker: cada módulo declara o destino e o propósito.
 * Identificadores e permissões são revalidados pelo servidor antes de usar o ID.
 */
export const fileRequestPurposes = [
  "general",
  "message-attachment",
  "student-document",
  "class-material",
  "finance-document",
] as const;

export type FileRequestPurpose = (typeof fileRequestPurposes)[number];

export type SchoolFileRequest = {
  purpose: FileRequestPurpose;
  relatedPersonId?: string | null;
  classGroupId?: string | null;
};

export function fileMatchesRequest(
  file: Pick<
    SchoolFileRecord,
    | "isFolder"
    | "storageBackend"
    | "area"
    | "visibility"
    | "relatedPersonId"
    | "classGroupId"
    | "category"
  >,
  request: SchoolFileRequest,
): boolean {
  if (file.isFolder) return false;
  if (request.purpose === "general") return true;

  // Um ficheiro apenas no IndexedDB não pode ser enviado a outro cliente.
  if (file.storageBackend !== "sga") return false;

  if (request.purpose === "message-attachment") return true;

  if (request.purpose === "student-document") {
    return (
      Boolean(request.relatedPersonId) &&
      file.area === "secretaria" &&
      file.visibility === "private" &&
      file.relatedPersonId === request.relatedPersonId
    );
  }

  if (request.purpose === "class-material") {
    return (
      Boolean(request.classGroupId) &&
      file.classGroupId === request.classGroupId &&
      (file.area === "escola" || file.area === "publico") &&
      file.visibility !== "private"
    );
  }

  if (request.purpose === "finance-document") {
    // Os comprovativos institucionais são arquivados na Secretaria ou na Escola.
    // A categoria, isoladamente, não autoriza um documento da pasta pessoal.
    return (
      (file.area === "secretaria" || file.area === "escola") &&
      (file.category === "fatura" || file.category === "recibo" || file.category === "talao")
    );
  }
  return false;
}
