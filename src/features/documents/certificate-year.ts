/**
 * Que ano o certificado de habilitações certifica.
 *
 * Antes era o ano mais recente com resultado registado, fosse qual fosse: um aluno que
 * reprovou o último ano recebia um certificado desse ano (com as notas negativas) em
 * vez do último ano concluído. E a turma e a classe impressas eram as de hoje, não as
 * do ano certificado. O resultado pode vir do motor («Transitou») ou da importação, em
 * texto livre («Aprovado», «Concluído com Êxito», «Transferido»).
 */
const PASSED = /transit|aprovad|conclu|êxito|exito|apto/i;
const NOT_PASSED = /não|nao|reprov|incomplet|transfer|anulad|desist|exclu|inapto/i;

export function isPassingOutcome(outcome: string | null | undefined): boolean {
  const text = String(outcome ?? "").trim();
  return PASSED.test(text) && !NOT_PASSED.test(text);
}

/** O último ano (por ordem do histórico) com resultado oficial de aprovação. */
export function latestCertifiableYear<T extends { official: { outcome: string } | null }>(
  years: readonly T[],
): T | null {
  for (let i = years.length - 1; i >= 0; i -= 1) {
    const year = years[i]!;
    if (year.official && isPassingOutcome(year.official.outcome)) return year;
  }
  return null;
}
