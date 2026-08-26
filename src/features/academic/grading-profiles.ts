/**
 * SIGA — Motor de notas configurável do Ensino Superior (Fase B).
 *
 * Os ciclos já suportados (primario/i_ciclo/ii_ciclo/tecnico/adultos) continuam a usar o motor
 * 0–20 de assessment-engine.ts sem qualquer alteração. Este módulo só entra em jogo quando o ciclo
 * é "superior" — a escala e a estrutura de avaliação são configuráveis, por escola (valor por
 * omissão) ou por curso (override), nunca fixas no código.
 */

import { normalizeScore } from "@/lib/angola-academic";

export type GradingScale = "20_ects" | "gpa4";
export type GradingComponents = "frequencia_exame" | "so_exame";

export interface GradingProfile {
  scale: GradingScale;
  components: GradingComponents;
}

/** Sugestão do sistema quando a escola ainda não configurou nada para o Ensino Superior. */
export const DEFAULT_SUPERIOR_GRADING_PROFILE: GradingProfile = {
  scale: "20_ects",
  components: "frequencia_exame",
};

/**
 * Resolve o perfil de notas efectivo de um curso: override do curso, senão o valor por omissão da
 * escola, senão a sugestão do sistema. Nunca lança erro — sempre devolve um perfil válido.
 */
export function resolveGradingProfile(params: {
  courseOverride?: Partial<GradingProfile> | null;
  schoolDefault?: Partial<GradingProfile> | null;
}): GradingProfile {
  const merged = {
    ...DEFAULT_SUPERIOR_GRADING_PROFILE,
    ...params.schoolDefault,
    ...params.courseOverride,
  };
  return {
    scale: merged.scale === "gpa4" ? "gpa4" : "20_ects",
    components: merged.components === "so_exame" ? "so_exame" : "frequencia_exame",
  };
}

/**
 * Nota final da disciplina na escala 0–20, a partir da estrutura de avaliação escolhida.
 * "frequencia_exame": média ponderada 40% frequência + 60% exame (só quando ambas presentes;
 * degrada para o valor disponível, mesma lógica de calculateTrimesterAverage). "so_exame": a nota
 * do exame é a nota final da disciplina.
 */
export function calculateComponentGrade(
  components: GradingComponents,
  frequencia: number | null | undefined,
  exame: number | null | undefined,
  weights: { frequencia: number; exame: number } = { frequencia: 0.4, exame: 0.6 },
): number | null {
  const normExame = normalizeScore(exame);
  if (components === "so_exame") return normExame;

  const normFrequencia = normalizeScore(frequencia);
  if (normFrequencia !== null && normExame !== null) {
    const value = normFrequencia * weights.frequencia + normExame * weights.exame;
    return Math.round((value + Number.EPSILON) * 10) / 10;
  }
  if (normFrequencia !== null) return normFrequencia;
  return normExame;
}

/** Média do semestre/curso ponderada por créditos ECTS, na escala 0–20. */
export function calculateCreditWeightedAverage(
  items: Array<{ score: number | null | undefined; credits: number }>,
): number | null {
  const valid = items
    .map((item) => ({ score: normalizeScore(item.score), credits: item.credits }))
    .filter(
      (item): item is { score: number; credits: number } => item.score !== null && item.credits > 0,
    );
  if (valid.length === 0) return null;
  const totalCredits = valid.reduce((sum, item) => sum + item.credits, 0);
  const weightedSum = valid.reduce((sum, item) => sum + item.score * item.credits, 0);
  if (totalCredits === 0) return null;
  return Math.round((weightedSum / totalCredits + Number.EPSILON) * 10) / 10;
}

export type LetterGrade = "A" | "B" | "C" | "D" | "F";

/** Bandas 0–20 → nota-letra, alinhadas com a escala de aprovação angolana/portuguesa (mínimo 10). */
export function scoreToLetterGrade(score0to20: number | null | undefined): LetterGrade | null {
  const value = normalizeScore(score0to20);
  if (value === null) return null;
  if (value >= 18) return "A";
  if (value >= 16) return "B";
  if (value >= 14) return "C";
  if (value >= 10) return "D";
  return "F";
}

export const LETTER_GRADE_GPA_POINTS: Record<LetterGrade, number> = {
  A: 4.0,
  B: 3.0,
  C: 2.0,
  D: 1.0,
  F: 0,
};

export function scoreToGpaPoints(score0to20: number | null | undefined): number | null {
  const letter = scoreToLetterGrade(score0to20);
  return letter === null ? null : LETTER_GRADE_GPA_POINTS[letter];
}

/** GPA (0–4) ponderado por créditos, a partir de notas 0–20 já calculadas por disciplina. */
export function calculateGpa(
  items: Array<{ score: number | null | undefined; credits: number }>,
): number | null {
  const valid = items
    .map((item) => ({ points: scoreToGpaPoints(item.score), credits: item.credits }))
    .filter(
      (item): item is { points: number; credits: number } =>
        item.points !== null && item.credits > 0,
    );
  if (valid.length === 0) return null;
  const totalCredits = valid.reduce((sum, item) => sum + item.credits, 0);
  if (totalCredits === 0) return null;
  const weightedSum = valid.reduce((sum, item) => sum + item.points * item.credits, 0);
  return Math.round((weightedSum / totalCredits + Number.EPSILON) * 100) / 100;
}

/**
 * Média final de um curso/semestre, na escala do perfil resolvido. `items` traz sempre a nota 0–20
 * já calculada por disciplina (via calculateComponentGrade) — só a forma de agregar muda com a
 * escala.
 */
export function calculateFinalAverage(
  profile: GradingProfile,
  items: Array<{ score: number | null | undefined; credits: number }>,
): number | null {
  return profile.scale === "gpa4" ? calculateGpa(items) : calculateCreditWeightedAverage(items);
}

/** Nota mínima de aprovação em cada escala. */
export function passingThreshold(profile: GradingProfile): number {
  return profile.scale === "gpa4" ? 2.0 : 10;
}
