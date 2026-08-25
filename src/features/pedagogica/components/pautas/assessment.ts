import type { AngolaTeachingCycle, StudentStatus } from './types';

export const MAX_GRADE = 20;
export const MIN_GRADE = 0;

export function isGrade(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_GRADE && value <= MAX_GRADE;
}

export function normalizeGrade(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value < MIN_GRADE || value > MAX_GRADE) {
    return null;
  }
  return value;
}

export function roundGrade(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Decreto Executivo n.º 424/25 — perfil de classes de transição.
 * MT = (MACT + NPT) / 2
 */
export function calculateTrimesterAverage(
  mact: number | null | undefined,
  npt: number | null | undefined,
  decimals = 0,
): number | null {
  const a = normalizeGrade(mact);
  const p = normalizeGrade(npt);
  if (a === null || p === null) return null;
  return roundGrade((a + p) / 2, decimals);
}

/** MFD = (MT1 + MT2 + MT3) / 3 */
export function calculateFinalDisciplineAverage(
  mt1: number | null | undefined,
  mt2: number | null | undefined,
  mt3: number | null | undefined,
  decimals = 0,
): number | null {
  const values = [normalizeGrade(mt1), normalizeGrade(mt2), normalizeGrade(mt3)];
  if (values.some((v) => v === null)) return null;
  const [a, b, c] = values as number[];
  return roundGrade((a + b + c) / 3, decimals);
}

/** Nota Final com Exame Nacional / Exame de Época: NF = (MFD * 0.6) + (Exame * 0.4) ou conforme ciclo. */
export function calculateExamFinalGrade(
  mfd: number | null | undefined,
  examGrade: number | null | undefined,
  weightMfd = 0.6,
  decimals = 0,
): number | null {
  const m = normalizeGrade(mfd);
  const e = normalizeGrade(examGrade);
  if (m === null && e === null) return null;
  if (m !== null && e === null) return m;
  if (m === null && e !== null) return e;
  return roundGrade((m! * weightMfd) + (e! * (1 - weightMfd)), decimals);
}

export function formatGrade(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function deriveElectronicStatusClass(status?: string): string {
  const negative = new Set([
    'NÃO TRANSITA', 'REPROVADO', 'NÃO ADMITIDO', 'NÃO APTO', 'RETIDO', 'EXCLUÍDO', 'NÃO APTO (PAP)', 'RECURSO',
  ]);
  const positive = new Set([
    'TRANSITA', 'APROVADO', 'APTO', 'APTO (PAP)',
  ]);

  if (!status) return 'text-foreground';
  const u = status.toUpperCase();
  if (negative.has(u)) return 'text-destructive font-bold';
  if (positive.has(u)) return 'text-emerald-600 dark:text-emerald-400 font-bold';
  return 'text-amber-600 dark:text-amber-400 font-bold';
}

/**
 * Avalia o resultado de transição escolar consoante o ciclo angolano:
 * - Primário: Média >= 10 transita.
 * - I Ciclo: Média >= 10; tolera até 2 deficientes.
 * - II Ciclo / Liceu: Admissão a exame se MFD >= 9 ou 10; Exame ou Recurso.
 * - Técnico-Profissional: Requer aprovação às componentes técnicas + PAP / Estágio >= 10.
 */
export function evaluateAngolanStatus(
  mfd: number | null,
  failingSubjectsCount = 0,
  cycle: AngolaTeachingCycle = 'i_ciclo',
  papGrade?: number | null
): StudentStatus {
  if (mfd === null) return '';

  if (cycle === 'primario') {
    return mfd >= 10 ? 'TRANSITA' : 'NÃO TRANSITA';
  }

  if (cycle === 'tecnico') {
    if (papGrade !== undefined && papGrade !== null && papGrade < 10) {
      return 'NÃO APTO (PAP)';
    }
    if (mfd >= 10 && failingSubjectsCount <= 2) {
      return 'APTO (PAP)';
    }
    return 'NÃO TRANSITA';
  }

  if (cycle === 'ii_ciclo') {
    if (mfd >= 10 && failingSubjectsCount === 0) return 'TRANSITA';
    if (mfd >= 9) return 'ADMITIDO A EXAME';
    return 'NÃO TRANSITA';
  }

  // Default: I Ciclo
  if (mfd >= 10 && failingSubjectsCount <= 2) return 'TRANSITA';
  return 'NÃO TRANSITA';
}
