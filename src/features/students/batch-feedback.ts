/**
 * Resultado de colocação em turma em lote.
 * Separar êxitos, falhas e alunos a repetir evita apagar a selecção após
 * uma operação parcialmente aplicada.
 */
export type BulkClassResult = {
  count: number;
  className: string;
  failed: readonly { studentId: string; message: string }[];
};

export function buildBulkClassFeedback(
  result: BulkClassResult,
  selectedIds: readonly string[],
  studentNameById: ReadonlyMap<string, string>,
  maxVisible = 4,
) {
  const failed = new Set(result.failed.map((item) => item.studentId));
  const retryStudentIds = selectedIds.filter((studentId) => failed.has(studentId));

  const visible = result.failed.slice(0, Math.max(0, maxVisible));
  const detailLines = visible.map((row) => {
    const name = studentNameById.get(row.studentId) || row.studentId;
    return `${name}: ${row.message}`;
  });
  if (result.failed.length > visible.length) {
    detailLines.push(`E mais ${result.failed.length - visible.length} aluno(s) por verificar.`);
  }

  return {
    successMessage:
      result.count > 0 ? `${result.count} aluno(s) na turma ${result.className}.` : null,
    failureMessage:
      result.failed.length > 0
        ? `${result.failed.length} aluno(s) não ficaram matriculados. Corrija ou repita apenas estes alunos.`
        : null,
    failureDetails: detailLines.join("\n"),
    retryStudentIds,
  };
}
