/**
 * Documentos pessoais reservados nunca podem ser considerados sincronizados
 * quando existem apenas no armazenamento local do browser.
 */
export function requiresVerifiedSchoolStorage(input: {
  area: string;
  visibility: string;
  relatedPersonId?: string | null;
}): boolean {
  return (
    input.area === "secretaria" && input.visibility === "private" && Boolean(input.relatedPersonId)
  );
}

export function assertVerifiedSchoolStorage(
  input: { area: string; visibility: string; relatedPersonId?: string | null },
  uploadedBackend: "sga" | "local",
  registeredBackend?: "sga" | "local",
): void {
  if (!requiresVerifiedSchoolStorage(input)) return;
  if (uploadedBackend !== "sga") {
    throw new Error(
      "O documento pessoal não foi enviado ao armazenamento seguro da escola. Verifique a ligação e tente novamente.",
    );
  }
  if (registeredBackend !== undefined && registeredBackend !== "sga") {
    throw new Error("Não foi possível registar o documento pessoal na base de dados da escola.");
  }
}
