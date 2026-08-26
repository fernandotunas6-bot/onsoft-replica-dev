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
  type AngolaTeachingCycle,
} from "@/lib/angola-academic";

// Reexportadas para compatibilidade — a matemática e os ciclos de ensino vivem em
// lib/angola-academic.ts (fonte única, partilhada com
// src/features/pedagogica/components/pautas/assessment.ts) para nunca reimplementar a fórmula do
// Decreto 424/25 nem a lista de ciclos em vários sítios.
export { normalizeScore, calculateTrimesterAverage, calculateDisciplineFinalAverage };
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
export function decidePromotionStatus(
  overallAvg: number,
  failingCount: number,
  cycle: AngolaTeachingCycle = "i_ciclo",
  papGrade?: number | null,
): PromotionStatus {
  if (cycle === "primario") {
    return overallAvg >= angolaGradeScale.passing ? "TRANSITA" : "NÃO TRANSITA";
  }

  if (cycle === "tecnico") {
    if (papGrade !== undefined && papGrade !== null && papGrade < angolaGradeScale.passing) {
      return "NÃO APTO (PAP)";
    }
    if (overallAvg >= angolaGradeScale.passing && failingCount <= 2) {
      return "APTO (PAP)";
    }
    return "NÃO TRANSITA";
  }

  if (cycle === "ii_ciclo") {
    if (overallAvg >= angolaGradeScale.passing && failingCount === 0) {
      return "TRANSITA";
    }
    if (overallAvg >= 9) {
      return "ADMITIDO A EXAME";
    }
    return "NÃO TRANSITA";
  }

  // Default: I Ciclo
  if (overallAvg >= angolaGradeScale.passing && failingCount <= 2) {
    return "TRANSITA";
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
}: {
  subjectResults: StudentSubjectSummary[];
  cycle?: AngolaTeachingCycle;
  papGrade?: number | null;
}): { status: PromotionStatus; failingCount: number } {
  const mfds = subjectResults.map((s) => s.mfd).filter((x): x is number => x !== null);

  if (mfds.length === 0) {
    return { status: "PENDENTE", failingCount: 0 };
  }

  const failingCount = subjectResults.filter(
    (s) => s.mfd !== null && s.mfd < angolaGradeScale.passing,
  ).length;
  const overallAvg = mfds.reduce((a, b) => a + b, 0) / mfds.length;

  return { status: decidePromotionStatus(overallAvg, failingCount, cycle, papGrade), failingCount };
}

/**
 * Constrói a síntese académica de uma turma completa a partir das avaliações e matrículas reais.
 */
export function buildClassAcademicSummaries({
  enrollments,
  subjects,
  termGrades,
  cycle = "i_ciclo",
}: {
  enrollments: Array<{ id: string; student_name: string; registration_number?: string | null }>;
  subjects: Array<{ id: string; name: string }>;
  termGrades: AssessmentItem[];
  cycle?: AngolaTeachingCycle;
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
    const overallMfd =
      validMfds.length > 0
        ? Math.round(
            (validMfds.reduce((a, b) => a + b, 0) / validMfds.length + Number.EPSILON) * 10,
          ) / 10
        : null;

    const { status, failingCount } = evaluateStudentPromotion({
      subjectResults: studentSubjectSummaries,
      cycle,
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
