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

/**
 * Só reconhecer repetição idempotente da MESMA operação do autor na escola.
 * Colisão de UUID com metadados divergentes nunca deve sobrescrever o registo.
 */
export function isMatchingRegisteredUpload(
  row: Record<string, unknown> | null,
  expected: {
    id: string;
    schoolId: string;
    ownerUserId: string;
    name: string;
    mime: string;
    sizeBytes: number;
    area: FileArea;
    visibility: string;
    storagePath: string;
    parentId?: string | null;
    classGroupId?: string | null;
    relatedPersonId?: string | null;
    relatedUserId?: string | null;
  },
): boolean {
  if (!row) return false;
  const same = (actual: unknown, value: unknown) => (actual ?? null) === (value ?? null);
  return (
    same(row["id"], expected.id) &&
    same(row["school_id"], expected.schoolId) &&
    same(row["owner_user_id"], expected.ownerUserId) &&
    same(row["name"], expected.name) &&
    same(row["mime"], expected.mime) &&
    same(row["size_bytes"], expected.sizeBytes) &&
    same(row["area"], expected.area) &&
    same(row["visibility"], expected.visibility) &&
    same(row["storage_path"], expected.storagePath) &&
    same(row["storage_backend"], "sga") &&
    same(row["parent_id"], expected.parentId) &&
    same(row["class_group_id"], expected.classGroupId) &&
    same(row["related_person_id"], expected.relatedPersonId) &&
    same(row["related_user_id"], expected.relatedUserId ?? expected.ownerUserId)
  );
}
