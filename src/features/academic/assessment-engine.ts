/**
 * SIGA — Assessment Engine & Promotion Service
 * Camada unificada para cálculo de médias, avaliações e regras de promoção escolar em Angola (Decreto 424/25 e MINED).
 */

import { angolaGradeScale } from "@/lib/angola-academic";

export type AngolaTeachingCycle = "primario" | "i_ciclo" | "ii_ciclo" | "tecnico" | "adultos";

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
  registrationNumber?: string;
  subjects: StudentSubjectSummary[];
  overallMfd: number | null;
  status: PromotionStatus;
  failingSubjectsCount: number;
}

export function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 20) return null;
  return Math.round((num + Number.EPSILON) * 10) / 10;
}

/**
 * Cálculo da Média Trimestral (MT) segundo o Decreto Executivo n.º 424/25:
 * MT = (MACT + NPT) / 2
 * Se NPT for omitido, degrada temporariamente para MACT ou Média Simples se houver NPP.
 */
export function calculateTrimesterAverage(
  mac: number | null | undefined,
  npt: number | null | undefined,
  npp?: number | null | undefined,
): number | null {
  const normMac = normalizeScore(mac);
  const normNpt = normalizeScore(npt);
  const normNpp = normalizeScore(npp);

  if (normMac !== null && normNpt !== null) {
    return Math.round(((normMac + normNpt) / 2 + Number.EPSILON) * 10) / 10;
  }

  if (normMac !== null && normNpp !== null && normNpt !== null) {
    return Math.round(((normMac + normNpp + normNpt) / 3 + Number.EPSILON) * 10) / 10;
  }

  if (normMac !== null) return normMac;
  if (normNpt !== null) return normNpt;
  return null;
}

/**
 * Média Final da Disciplina (MFD):
 * MFD = (MT1 + MT2 + MT3) / 3
 */
export function calculateDisciplineFinalAverage(
  mt1: number | null | undefined,
  mt2: number | null | undefined,
  mt3: number | null | undefined,
): number | null {
  const v1 = normalizeScore(mt1);
  const v2 = normalizeScore(mt2);
  const v3 = normalizeScore(mt3);

  const valid = [v1, v2, v3].filter((x): x is number => x !== null);
  if (valid.length === 0) return null;

  // Se os 3 trimestres estiverem presentes:
  if (valid.length === 3) {
    return Math.round(((v1! + v2! + v3!) / 3 + Number.EPSILON) * 10) / 10;
  }

  // Média parcial dos trimestres disponíveis
  const sum = valid.reduce((a, b) => a + b, 0);
  return Math.round((sum / valid.length + Number.EPSILON) * 10) / 10;
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

  const failingCount = subjectResults.filter((s) => s.mfd !== null && s.mfd < angolaGradeScale.passing).length;
  const overallAvg = mfds.reduce((a, b) => a + b, 0) / mfds.length;

  if (cycle === "primario") {
    return {
      status: overallAvg >= angolaGradeScale.passing ? "TRANSITA" : "NÃO TRANSITA",
      failingCount,
    };
  }

  if (cycle === "tecnico") {
    if (papGrade !== undefined && papGrade !== null && papGrade < angolaGradeScale.passing) {
      return { status: "NÃO APTO (PAP)", failingCount };
    }
    if (overallAvg >= angolaGradeScale.passing && failingCount <= 2) {
      return { status: "APTO (PAP)", failingCount };
    }
    return { status: "NÃO TRANSITA", failingCount };
  }

  if (cycle === "ii_ciclo") {
    if (overallAvg >= angolaGradeScale.passing && failingCount === 0) {
      return { status: "TRANSITA", failingCount };
    }
    if (overallAvg >= 9) {
      return { status: "ADMITIDO A EXAME", failingCount };
    }
    return { status: "NÃO TRANSITA", failingCount };
  }

  // Default: I Ciclo
  if (overallAvg >= angolaGradeScale.passing && failingCount <= 2) {
    return { status: "TRANSITA", failingCount };
  }
  return { status: "NÃO TRANSITA", failingCount };
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
        (g) => g.enrollment_id === e.id && g.subject_id === sub.id
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

    const validMfds = studentSubjectSummaries.map((s) => s.mfd).filter((x): x is number => x !== null);
    const overallMfd = validMfds.length > 0
      ? Math.round((validMfds.reduce((a, b) => a + b, 0) / validMfds.length + Number.EPSILON) * 10) / 10
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
