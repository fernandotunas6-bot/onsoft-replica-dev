import type { AngolaTeachingCycle, StudentStatus } from "./types";
import {
  calculateTrimesterAverage as engineTrimesterAverage,
  calculateDisciplineFinalAverage as engineDisciplineFinalAverage,
  decidePromotionStatus,
} from "@/features/academic/assessment-engine";

export const MAX_GRADE = 20;
export const MIN_GRADE = 0;

export function isGrade(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= MIN_GRADE && value <= MAX_GRADE
  );
}

export function normalizeGrade(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value < MIN_GRADE || value > MAX_GRADE) {
    return null;
  }
  return value;
}

export function roundGrade(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Decreto Executivo n.º 424/25 — MT = (MACT + NPT) / 2. A fórmula vive em
 * src/features/academic/assessment-engine.ts (fonte única); esta função só acrescenta a exigência
 * de a pauta impressa não mostrar uma média enquanto MACT ou NPT ainda não tiverem sido lançados
 * (o motor, em contexto de lançamento de notas, degrada para o valor disponível — aqui não).
 */
export function calculateTrimesterAverage(
  mact: number | null | undefined,
  npt: number | null | undefined,
  decimals = 1,
): number | null {
  const a = normalizeGrade(mact);
  const p = normalizeGrade(npt);
  if (a === null || p === null) return null;
  const value = engineTrimesterAverage(a, p);
  return value === null ? null : roundGrade(value, decimals);
}

/**
 * MFD = (MT1 + MT2 + MT3) / 3 (ou / 2 no Ensino Superior, `periodCount: 2`). Delega no motor
 * único; só devolve valor quando todos os períodos do ciclo estão presentes, porque uma Pauta
 * Final impressa não pode mostrar uma MFD parcial.
 */
export function calculateFinalDisciplineAverage(
  mt1: number | null | undefined,
  mt2: number | null | undefined,
  mt3: number | null | undefined,
  periodCount: 2 | 3 = 3,
  decimals = 1,
): number | null {
  const a = normalizeGrade(mt1);
  const b = normalizeGrade(mt2);
  const c = periodCount === 2 ? null : normalizeGrade(mt3);
  const required = periodCount === 2 ? [a, b] : [a, b, c];
  if (required.some((v) => v === null)) return null;
  const value = engineDisciplineFinalAverage(a, b, c);
  return value === null ? null : roundGrade(value, decimals);
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
  return roundGrade(m! * weightMfd + e! * (1 - weightMfd), decimals);
}

export function formatGrade(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export function deriveElectronicStatusClass(status?: string): string {
  const negative = new Set([
    "NÃO TRANSITA",
    "REPROVADO",
    "NÃO ADMITIDO",
    "NÃO APTO",
    "RETIDO",
    "EXCLUÍDO",
    "NÃO APTO (PAP)",
    "RECURSO",
  ]);
  const positive = new Set(["TRANSITA", "APROVADO", "APTO", "APTO (PAP)"]);

  if (!status) return "text-foreground";
  const u = status.toUpperCase();
  if (negative.has(u)) return "text-destructive font-bold";
  if (positive.has(u)) return "text-emerald-600 dark:text-emerald-400 font-bold";
  return "text-amber-600 dark:text-amber-400 font-bold";
}

/**
 * Avalia o resultado de transição escolar consoante o ciclo angolano. As regras por ciclo vivem em
 * `decidePromotionStatus` (src/features/academic/assessment-engine.ts) — mesma fonte usada pelo
 * Certificado, Histórico e Pauta Final, para nunca divergir do que é impresso nesses documentos:
 * - Primário: Média >= 10 transita.
 * - I Ciclo: Média >= 10; tolera até 2 deficientes.
 * - II Ciclo / Liceu: Admissão a exame se MFD >= 9 ou 10; Exame ou Recurso.
 * - Técnico-Profissional: Requer aprovação às componentes técnicas + PAP / Estágio >= 10.
 */
export function evaluateAngolanStatus(
  mfd: number | null,
  failingSubjectsCount = 0,
  cycle: AngolaTeachingCycle = "i_ciclo",
  papGrade?: number | null,
): StudentStatus {
  if (mfd === null) return "";
  return decidePromotionStatus(mfd, failingSubjectsCount, cycle, papGrade) as StudentStatus;
}
