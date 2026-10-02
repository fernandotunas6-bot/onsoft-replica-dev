/**
 * SIGA — Assessment Engine & Promotion Service
 * Camada unificada para cálculo de médias, avaliações e regras de promoção escolar em Angola (Decreto 424/25 e MINED).
 */

import {
  angolaGradeScale,
  normalizeScore,
  calculateTrimesterAverage,
  calculateDisciplineFinalAverage,
  getPeriodCountForCycle,
  getPeriodsForCycle,
  getPeriodNoun,
  getPeriodLabel,
  getPeriodLabelUpper,
  roundToOneDecimal,
  type AngolaTeachingCycle,
} from "@/lib/angola-academic";
import { DEFAULT_PROMOTION_RULES, promotionRuleFor, type PromotionRules } from "./assessment-model";

// Reexportadas para compatibilidade — a matemática e os ciclos de ensino vivem em
// lib/angola-academic.ts (fonte única, partilhada com
// src/features/pedagogica/components/pautas/assessment.ts) para nunca reimplementar a fórmula do
// Decreto 424/25 nem a lista de ciclos em vários sítios.
export { normalizeScore, calculateTrimesterAverage, calculateDisciplineFinalAverage };
export { roundToOneDecimal };
export {
  getPeriodCountForCycle,
  getPeriodsForCycle,
  getPeriodNoun,
  getPeriodLabel,
  getPeriodLabelUpper,
};
export type { AngolaTeachingCycle };

export type PromotionStatus =
  | "TRANSITA"
  | "NÃO TRANSITA"
  | "APROVADO"
  | "REPROVADO"
  | "ADMITIDO A EXAME"
  | "RECURSO"
  | "APTO (PAP)"
  | "NÃO APTO (PAP)"
  | "PENDENTE"
  | "";

export interface AssessmentItem {
  id: string;
  enrollment_id: string;
  subject_id: string;
  term: 1 | 2 | 3;
  mac: number | null;
  npp: number | null;
  npt: number | null;
}

export interface StudentSubjectSummary {
  subjectId: string;
  subjectName: string;
  mt1: number | null;
  mt2: number | null;
  mt3: number | null;
  mfd: number | null;
}

export interface StudentAcademicSummary {
  enrollmentId: string;
  studentName: string;
  registrationNumber?: string | undefined;
  subjects: StudentSubjectSummary[];
  overallMfd: number | null;
  status: PromotionStatus;
  failingSubjectsCount: number;
}

/**
 * Decide o estado de promoção a partir de uma média já calculada e do número de disciplinas
 * reprovadas — partilhado por `evaluateStudentPromotion` (que deriva estes valores a partir de
 * `subjectResults`) e por `evaluateAngolanStatus` em
 * src/features/pedagogica/components/pautas/assessment.ts (que já os recebe calculados), para não
 * duplicar as regras por ciclo em dois sítios.
 */
export type PromotionOptions = {
  /** Nota de aprovação do modelo em vigor (por omissão, a da escala angolana). */
  passing?: number;
  /** Regras de transição por ciclo do modelo (por omissão, as que o SIGA aplicava). */
  rules?: PromotionRules;
};

export function decidePromotionStatus(
  overallAvg: number,
  failingCount: number,
  cycle: AngolaTeachingCycle = "i_ciclo",
  papGrade?: number | null,
  options: PromotionOptions = {},
): PromotionStatus {
  const passing = options.passing ?? angolaGradeScale.passing;
  const rule = promotionRuleFor(options.rules ?? DEFAULT_PROMOTION_RULES, cycle);
  const withinFailures = rule.maxFailedSubjects == null || failingCount <= rule.maxFailedSubjects;
  const passes = overallAvg >= passing && withinFailures;

  if (rule.requiresPap) {
    if (papGrade !== undefined && papGrade !== null && papGrade < passing) {
      return "NÃO APTO (PAP)";
    }
    if (passes) return "APTO (PAP)";
  } else if (passes) {
    return "TRANSITA";
  }
  if (rule.examAdmissionMinimum != null && overallAvg >= rule.examAdmissionMinimum) {
    return "ADMITIDO A EXAME";
  }
  return "NÃO TRANSITA";
}

/**
 * Motor de Avaliação de Promoção Pedagógica (PromotionEngine)
 */
export function evaluateStudentPromotion({
  subjectResults,
  cycle = "i_ciclo",
  papGrade,
  options = {},
}: {
  subjectResults: StudentSubjectSummary[];
  cycle?: AngolaTeachingCycle;
  papGrade?: number | null;
  options?: PromotionOptions;
}): { status: PromotionStatus; failingCount: number } {
  const mfds = subjectResults.map((s) => s.mfd).filter((x): x is number => x !== null);

  if (mfds.length === 0) {
    return { status: "PENDENTE", failingCount: 0 };
  }

  const failingCount = subjectResults.filter(
    (s) => s.mfd !== null && s.mfd < (options.passing ?? angolaGradeScale.passing),
  ).length;

  // A média decide **arredondada**, que é a mesma que a pauta imprime.
  //
  // Antes decidia sobre o valor bruto enquanto `buildClassAcademicSummaries` imprimia o
  // arredondado, e os dois saem no mesmo objecto, lado a lado no documento. Com MFDs de
  // 9,9 e 10,0 a média bruta é 9,95: a pauta dizia **"Média 10,0 — NÃO TRANSITA"**. Numa
  // faixa estreita ([9,95 ; 10,0[) mas nada rara numa turma inteira, e num documento
  // oficial que a escola tem de defender perante um encarregado.
  //
  // Qual das duas corrigir não é indiferente: um documento tem de ser reproduzível a
  // partir do que nele está escrito. Quem lê "10,0" tem de chegar ao mesmo resultado que
  // a escola chegou. Por isso alinha-se a decisão pelo número impresso, e não o contrário.
  //
  // A regra de arredondamento devia vir de `assessment_rule_sets.rounding_method`, que
  // existe na base e não é lida por ninguém (docs/auditoria/05-auditoria.md, 5.1). Até lá,
  // uma casa decimal — a mesma de `normalizeScore` e de `calculateDisciplineFinalAverage`.
  const overallAvg = roundToOneDecimal(mfds.reduce((a, b) => a + b, 0) / mfds.length);

  return {
    status: decidePromotionStatus(overallAvg, failingCount, cycle, papGrade, options),
    failingCount,
  };
}

/**
 * Constrói a síntese académica de uma turma completa a partir das avaliações e matrículas reais.
 */
export function buildClassAcademicSummaries({
  enrollments,
  subjects,
  termGrades,
  cycle = "i_ciclo",
  options = {},
}: {
  enrollments: Array<{ id: string; student_name: string; registration_number?: string | null }>;
  subjects: Array<{ id: string; name: string }>;
  termGrades: AssessmentItem[];
  cycle?: AngolaTeachingCycle;
  options?: PromotionOptions;
}): StudentAcademicSummary[] {
  return enrollments.map((e) => {
    const studentSubjectSummaries: StudentSubjectSummary[] = subjects.map((sub) => {
      const studentGrades = termGrades.filter(
        (g) => g.enrollment_id === e.id && g.subject_id === sub.id,
      );

      const g1 = studentGrades.find((g) => g.term === 1);
      const g2 = studentGrades.find((g) => g.term === 2);
      const g3 = studentGrades.find((g) => g.term === 3);

      const mt1 = calculateTrimesterAverage(g1?.mac, g1?.npt, g1?.npp);
      const mt2 = calculateTrimesterAverage(g2?.mac, g2?.npt, g2?.npp);
      const mt3 = calculateTrimesterAverage(g3?.mac, g3?.npt, g3?.npp);
      const mfd = calculateDisciplineFinalAverage(mt1, mt2, mt3);

      return {
        subjectId: sub.id,
        subjectName: sub.name,
        mt1,
        mt2,
        mt3,
        mfd,
      };
    });

    const validMfds = studentSubjectSummaries
      .map((s) => s.mfd)
      .filter((x): x is number => x !== null);
    // Mesmo helper que `evaluateStudentPromotion` usa para decidir: é o que garante que
    // o número impresso e o estado impresso nunca se contradizem.
    const overallMfd =
      validMfds.length > 0
        ? roundToOneDecimal(validMfds.reduce((a, b) => a + b, 0) / validMfds.length)
        : null;

    const { status, failingCount } = evaluateStudentPromotion({
      subjectResults: studentSubjectSummaries,
      cycle,
      options,
    });

    return {
      enrollmentId: e.id,
      studentName: e.student_name,
      registrationNumber: e.registration_number ?? undefined,
      subjects: studentSubjectSummaries,
      overallMfd,
      status,
      failingSubjectsCount: failingCount,
    };
  });
}
