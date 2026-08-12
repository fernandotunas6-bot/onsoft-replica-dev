import type { SchoolFileRecord } from "./schemas";

/** Referência textual — sem URL assinada nem blob. */
export function schoolFileShareText(file: Pick<SchoolFileRecord, "name">, classLabel?: string) {
  return classLabel
    ? `[Arquivo SIGA] ${file.name} · turma ${classLabel}`
    : `[Arquivo SIGA] ${file.name}`;
}
