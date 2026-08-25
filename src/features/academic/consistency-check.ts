/**
 * SIGA — Academic Consistency Check Service
 * Valida a integridade dos dados académicos antes de fechar pautas ou emitir documentos oficiais.
 */

export interface ConsistencyCheckIssue {
  type: "error" | "warning";
  code: string;
  message: string;
  enrollmentId?: string;
  studentName?: string;
  subjectId?: string;
  subjectName?: string;
}

export interface ConsistencyCheckReport {
  classGroupId: string;
  classGroupName: string;
  totalStudents: number;
  totalSubjects: number;
  isReadyToLock: boolean;
  issues: ConsistencyCheckIssue[];
  summary: {
    validStudents: number;
    pendingGradesCount: number;
    unassignedSubjectsCount: number;
    invalidEnrollmentsCount: number;
  };
}

export function runAcademicConsistencyCheck({
  classGroupId,
  classGroupName,
  enrollments,
  subjects,
  classSubjects,
  termGrades,
  term = 1,
}: {
  classGroupId: string;
  classGroupName: string;
  enrollments: Array<{ id: string; student_name: string; status?: string | null }>;
  subjects: Array<{ id: string; name: string }>;
  classSubjects: Array<{ subject_id: string; teacher_id?: string | null }>;
  termGrades: Array<{ enrollment_id: string; subject_id: string; term: number; mac?: number | null; npt?: number | null }>;
  term?: number;
}): ConsistencyCheckReport {
  const issues: ConsistencyCheckIssue[] = [];
  let pendingGradesCount = 0;
  let unassignedSubjectsCount = 0;
  let invalidEnrollmentsCount = 0;

  // 1. Verificar docentes atribuídos a cada disciplina da turma
  subjects.forEach((sub) => {
    const cs = classSubjects.find((x) => x.subject_id === sub.id);
    if (!cs || !cs.teacher_id) {
      unassignedSubjectsCount += 1;
      issues.push({
        type: "warning",
        code: "UNASSIGNED_TEACHER",
        message: `A disciplina "${sub.name}" não tem docente atribuído na turma ${classGroupName}.`,
        subjectId: sub.id,
        subjectName: sub.name,
      });
    }
  });

  // 2. Verificar matrículas válidas
  const activeEnrollments = enrollments.filter((e) => !e.status || e.status === "active" || e.status === "Activa");
  const inactiveCount = enrollments.length - activeEnrollments.length;
  if (inactiveCount > 0) {
    invalidEnrollmentsCount += inactiveCount;
    issues.push({
      type: "warning",
      code: "INACTIVE_ENROLLMENTS",
      message: `Existem ${inactiveCount} aluno(s) com matrícula suspensa ou inativa na turma.`,
    });
  }

  // 3. Verificar notas pendentes por aluno e disciplina no trimestre
  activeEnrollments.forEach((e) => {
    subjects.forEach((sub) => {
      const grade = termGrades.find(
        (g) => g.enrollment_id === e.id && g.subject_id === sub.id && g.term === term
      );

      if (!grade || grade.mac === null || grade.mac === undefined || grade.npt === null || grade.npt === undefined) {
        pendingGradesCount += 1;
        issues.push({
          type: "warning",
          code: "PENDING_GRADE",
          message: `Nota do ${term}.º trimestre pendente para ${e.student_name} em "${sub.name}".`,
          enrollmentId: e.id,
          studentName: e.student_name,
          subjectId: sub.id,
          subjectName: sub.name,
        });
      }
    });
  });

  const isReadyToLock = issues.filter((i) => i.type === "error").length === 0 && pendingGradesCount === 0;

  return {
    classGroupId,
    classGroupName,
    totalStudents: enrollments.length,
    totalSubjects: subjects.length,
    isReadyToLock,
    issues,
    summary: {
      validStudents: activeEnrollments.length,
      pendingGradesCount,
      unassignedSubjectsCount,
      invalidEnrollmentsCount,
    },
  };
}
