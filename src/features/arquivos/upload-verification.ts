/**
 * O registo de metadados deve apontar para um blob realmente presente no
 * Storage. O browser não é a fonte de verdade para o tamanho guardado.
 */
export function assertUploadedSchoolFileMatches(
  object: { size?: number | null } | null,
  expectedSize: number,
): void {
  if (!object || typeof object.size !== "number" || !Number.isSafeInteger(object.size)) {
    throw new Error("Não foi possível confirmar o ficheiro no armazenamento da escola.");
  }
  if (object.size < 1 || object.size !== expectedSize) {
    throw new Error(
      "O tamanho do ficheiro no armazenamento não corresponde ao envio. Repita a operação.",
    );
  }
}
