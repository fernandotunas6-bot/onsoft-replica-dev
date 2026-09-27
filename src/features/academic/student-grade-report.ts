/**
 * Boletim do aluno: médias por trimestre, média final e o que falta para
 * aprovar. Cálculo puro (sem I/O), sobre as fórmulas do Decreto Executivo
 * n.º 424/25 em lib/angola-academic.ts — não reimplementa a média.
 */
import {
  angolaGradeScale,
  calculateDisciplineFinalAverage,
  calculateTrimesterAverage,
  normalizeScore,
} from "@/lib/angola-academic";

export type TermGrade = {
  mac: number | null;
  npp: number | null;
  npt: number | null;
  /** Média trimestral (MT); null sem MAC nem NPT. */
  mt: number | null;
  /** O diário deste trimestre ainda não foi fechado: a nota pode mudar. */
  provisional: boolean;
};

export type PassOutlook =
  | { kind: "no-data" }
  | { kind: "complete"; passed: boolean }
  | { kind: "secured" }
  | { kind: "needs"; average: number; remainingTerms: number }
  | { kind: "unreachable"; remainingTerms: number };

export type SubjectYearReport = {
  subjectId: string;
  subjectName: string;
  /** Índice 0 = 1.º trimestre. */
  terms: Array<TermGrade | null>;
  finalAverage: number | null;
  passing: number;
  outlook: PassOutlook;
};

export function buildTermGrade(input: {
  mac?: number | null;
  npp?: number | null;
  npt?: number | null;
  provisional?: boolean;
}): TermGrade {
  const mac = normalizeScore(input.mac);
  const npp = normalizeScore(input.npp);
  const npt = normalizeScore(input.npt);
  return {
    mac,
    npp,
    npt,
    mt: calculateTrimesterAverage(mac, npt, npp),
    provisional: Boolean(input.provisional),
  };
}

/**
 * Para aprovar, a média final (média das MT) tem de chegar a `passing`.
 * Com `k` trimestres por lançar, a média que falta nesses k é
 * (passing × n − soma das MT conhecidas) / k, arredondada para cima à décima.
 */
export function passOutlook(
  termAverages: Array<number | null>,
  termCount: number,
  passing: number = angolaGradeScale.passing,
): PassOutlook {
  const count = Math.max(1, termCount);
  const known = termAverages.slice(0, count).filter((v): v is number => v != null);
  if (known.length === 0) return { kind: "no-data" };
  const remaining = count - known.length;
  const sum = known.reduce((a, b) => a + b, 0);
  if (remaining <= 0) {
    const final = Math.round((sum / known.length + Number.EPSILON) * 10) / 10;
    return { kind: "complete", passed: final >= passing };
  }
  const needed = Math.ceil(((passing * count - sum) / remaining) * 10 - 1e-9) / 10;
  if (needed <= 0) return { kind: "secured" };
  if (needed > angolaGradeScale.max) return { kind: "unreachable", remainingTerms: remaining };
  return { kind: "needs", average: needed, remainingTerms: remaining };
}

export function buildSubjectYearReport(input: {
  subjectId: string;
  subjectName: string;
  terms: Array<TermGrade | null>;
  termCount: number;
  passing?: number | null;
}): SubjectYearReport {
  const passing =
    input.passing != null && Number.isFinite(input.passing)
      ? input.passing
      : angolaGradeScale.passing;
  const count = Math.max(1, input.termCount);
  const terms = Array.from({ length: count }, (_, i) => input.terms[i] ?? null);
  const mts = terms.map((term) => term?.mt ?? null);
  return {
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    terms,
    finalAverage: calculateDisciplineFinalAverage(mts[0], mts[1], mts[2]),
    passing,
    outlook: passOutlook(mts, count, passing),
  };
}

/** Média geral do ano: média das médias finais disponíveis. */
export function overallAverage(subjects: SubjectYearReport[]): number | null {
  const finals = subjects.map((s) => s.finalAverage).filter((v): v is number => v != null);
  if (!finals.length) return null;
  return Math.round((finals.reduce((a, b) => a + b, 0) / finals.length + Number.EPSILON) * 10) / 10;
}

export function outlookLabel(outlook: PassOutlook): string {
  switch (outlook.kind) {
    case "no-data":
      return "Sem notas lançadas";
    case "complete":
      return outlook.passed ? "Aprovado" : "Não aprovado";
    case "secured":
      return "Aprovação garantida";
    case "needs":
      return outlook.remainingTerms === 1
        ? `Precisa de ${outlook.average.toFixed(1)} no último trimestre`
        : `Precisa de ${outlook.average.toFixed(1)} de média nos ${outlook.remainingTerms} trimestres que faltam`;
    case "unreachable":
      return "Já não chega à aprovação pelas médias";
  }
}
