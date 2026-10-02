import { calculateFinalDisciplineAverage, calculateTrimesterAverage } from "./assessment";

export type OfficialSubjectSummary = {
  subjectId: string;
  mt1: number | null;
  mt2: number | null;
  mt3: number | null;
  mfd: number | null;
};

export type OfficialPautaSummary = {
  subjects: OfficialSubjectSummary[];
  /** Uma pauta oficial não pode decidir resultado com disciplinas/períodos por fechar. */
  isComplete: boolean;
};

type GradeEntry = {
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number | null;
  npt: number | null;
};

/**
 * Converte notas da grelha viva na projecção rigorosa usada nos documentos oficiais.
 *
 * O lançamento permite acompanhar uma nota incompleta. A pauta impressa, pelo contrário,
 * só pode exibir MT se MACT e NPT existirem e só emite MFD com todos os períodos exigidos.
 */
export function buildOfficialPautaSummaries({
  enrollments,
  subjects,
  termGrades,
  periodCount,
}: {
  enrollments: Array<{ id: string }>;
  subjects: Array<{ id: string }>;
  termGrades: GradeEntry[];
  periodCount: 2 | 3;
}): Map<string, OfficialPautaSummary> {
  const gradeFor = (enrollmentId: string, subjectId: string, term: 1 | 2 | 3) =>
    termGrades.find(
      (grade) =>
        grade.enrollment_id === enrollmentId &&
        grade.subject_id === subjectId &&
        grade.term === term,
    );

  return new Map<string, OfficialPautaSummary>(
    enrollments.map((enrollment) => {
      const subjectSummaries = subjects.map((subject) => {
        const g1 = gradeFor(enrollment.id, subject.id, 1);
        const g2 = gradeFor(enrollment.id, subject.id, 2);
        const g3 = gradeFor(enrollment.id, subject.id, 3);
        const mt1 = calculateTrimesterAverage(g1?.mac, g1?.npt);
        const mt2 = calculateTrimesterAverage(g2?.mac, g2?.npt);
        const mt3 = calculateTrimesterAverage(g3?.mac, g3?.npt);

        return {
          subjectId: subject.id,
          mt1,
          mt2,
          mt3,
          mfd: calculateFinalDisciplineAverage(mt1, mt2, mt3, periodCount),
        };
      });

      return [
        enrollment.id,
        {
          subjects: subjectSummaries,
          isComplete:
            subjectSummaries.length > 0 &&
            subjectSummaries.every((subject) => subject.mfd !== null),
        },
      ] as const;
    }),
  );
}
