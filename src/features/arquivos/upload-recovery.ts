import type { FileArea } from "./kinds";

/**
 * As tentativas sobrevivem a falhas transitórias enquanto o browser mantém
 * os File originais. Não expor id/path entre escolas, contas ou áreas.
 */
export type PreparedSchoolUpload = {
  id: string;
  storagePath: string;
  schoolId: string;
  ownerUserId: string;
  area: FileArea;
  uploaded: boolean;
};

export function prepareSchoolUpload<T extends object>(
  registry: WeakMap<T, PreparedSchoolUpload>,
  file: T,
  draft: Omit<PreparedSchoolUpload, "uploaded">,
): PreparedSchoolUpload {
  const existing = registry.get(file);
  if (existing) {
    if (
      existing.schoolId !== draft.schoolId ||
      existing.ownerUserId !== draft.ownerUserId ||
      existing.area !== draft.area
    ) {
      throw new Error(
        "Este envio tem uma tentativa pendente noutra escola, conta ou área. Retome com o destino original.",
      );
    }
    return existing;
  }
  const attempt: PreparedSchoolUpload = { ...draft, uploaded: false };
  registry.set(file, attempt);
  return attempt;
}

/** Não repetir ficheiros concluídos durante uma operação parcial. */
export function remainingSchoolUploads<T>(files: readonly T[], completed: number): T[] {
  if (!Number.isSafeInteger(completed) || completed < 0 || completed > files.length) {
    throw new Error("Estado de recuperação de uploads inválido.");
  }
  return files.slice(completed);
}
