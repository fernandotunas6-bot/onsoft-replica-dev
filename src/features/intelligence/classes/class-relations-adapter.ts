export interface ClassRelationsSnapshot {
  classGroupId: string;
  enrollment: { count: number; capacity: number | null };
  disciplinas: { count: number; semProfessorCount: number };
  horario: { count: number };
  avaliacoes: { count: number };
  academic: { averageScore: number | null; attendanceRate: number | null };
}

interface ClassGroupLike {
  id: string;
  enrolled_count: number;
  capacity: number | null;
  average_score: number | null;
  attendance_rate: number | null;
}

interface ClassSubjectLike {
  teacher_name: string | null;
}

export function mapClassGroupToSnapshot(
  turma: ClassGroupLike,
  disciplinas: ClassSubjectLike[],
  horarioCount: number,
  avaliacoesCount: number,
): ClassRelationsSnapshot {
  return {
    classGroupId: turma.id,
    enrollment: { count: turma.enrolled_count, capacity: turma.capacity },
    disciplinas: {
      count: disciplinas.length,
      semProfessorCount: disciplinas.filter((row) => !row.teacher_name).length,
    },
    horario: { count: horarioCount },
    avaliacoes: { count: avaliacoesCount },
    academic: { averageScore: turma.average_score, attendanceRate: turma.attendance_rate },
  };
}
