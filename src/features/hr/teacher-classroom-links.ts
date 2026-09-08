/** Deep-links do fluxo tutor (QR → chamada → notas → plano → materiais). */

export function teacherGradesSearch(classGroupId: string, subjectId: string) {
  return {
    tab: "notas" as const,
    turma: classGroupId,
    disciplina: subjectId,
    pauta: "1" as const,
  };
}

/** Abre a aba de chamada com turma/disciplina pré-seleccionadas (cria sessão se preciso). */
export function teacherAttendanceCallSearch(
  classGroupId: string,
  subjectId: string,
  date?: string,
) {
  return {
    tab: "chamada" as const,
    turma: classGroupId,
    disciplina: subjectId,
    ...(date ? { dia: date } : {}),
  };
}

/**
 * Abre `/professor/presenca` com contexto da aula (sem abrir a chamada).
 * O painel destaca a ocorrência correspondente para o check-in QR.
 */
export function teacherQrPresenceSearch(
  classGroupId: string,
  subjectId: string,
  date?: string,
) {
  return {
    turma: classGroupId,
    disciplina: subjectId,
    ...(date ? { data: date } : {}),
  };
}

export function teacherLessonPlansSearch(classGroupId: string, subjectId: string) {
  return {
    turma: classGroupId,
    disciplina: subjectId,
  };
}

export function teacherClassFilesSearch(classGroupId: string) {
  return {
    turma: classGroupId,
  };
}

/** Acções rápidas a partir de uma aula da agenda (topbar / calendário). */
export function agendaLessonActions(lesson: {
  classGroupId: string | null;
  subjectId: string | null;
  date?: string;
}) {
  if (!lesson.classGroupId || !lesson.subjectId) return null;
  return {
    callSearch: teacherAttendanceCallSearch(
      lesson.classGroupId,
      lesson.subjectId,
      lesson.date,
    ),
    gradesSearch: teacherGradesSearch(lesson.classGroupId, lesson.subjectId),
    qrSearch: teacherQrPresenceSearch(lesson.classGroupId, lesson.subjectId, lesson.date),
  };
}
