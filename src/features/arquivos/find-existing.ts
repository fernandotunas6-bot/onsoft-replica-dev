import type { FileArea } from "./kinds";

/** Correspondência indicativa: nome e tamanho não comprovam identidade do conteúdo. */
export type ExistingSchoolFileLocation = {
  id: string;
  name: string;
  sizeBytes: number;
  area: FileArea;
  parentId: string | null;
  folderName: string | null;
};

export type ExistingFilePlacement = "same-folder" | "another-folder" | "same-name";

export function classifyExistingFile(
  existing: ExistingSchoolFileLocation,
  incoming: { name: string; size: number },
  targetArea: FileArea,
  targetFolderId: string | null,
): ExistingFilePlacement | null {
  // A consulta PostgREST procura nome exacto; o mesmo critério aplica-se aqui.
  if (existing.name !== incoming.name) {
    return null;
  }
  if (existing.sizeBytes !== incoming.size) return "same-name";
  return existing.area === targetArea && existing.parentId === targetFolderId
    ? "same-folder"
    : "another-folder";
}

/** Nunca presumir que a raiz é a pasta errada: só comparamos o destino escolhido. */
export function describeFileLocation(
  existing: ExistingSchoolFileLocation,
  areaLabels: Record<FileArea, string>,
): string {
  const folder = existing.parentId ? (existing.folderName ?? "Pasta reservada") : "Raiz";
  return `${areaLabels[existing.area]} / ${folder}`;
}
