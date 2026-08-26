export interface TeacherRelationsSnapshot {
  teacherId: string;
  profile: { hasEmail: boolean; hasPhone: boolean };
  classes: { count: number; subjectCount: number };
  schedule: { count: number };
  enrollments: { count: number };
}

interface TeacherLike {
  id: string;
  email: string | null;
  phone: string | null;
}

interface TeacherWorkspaceLike {
  classes: Array<{ subject_id: string }>;
  enrollments: Array<unknown>;
  schedule: Array<unknown>;
}

export function mapTeacherWorkspaceToSnapshot(
  teacher: TeacherLike,
  workspace: TeacherWorkspaceLike | undefined,
): TeacherRelationsSnapshot {
  const classes = workspace?.classes ?? [];
  return {
    teacherId: teacher.id,
    profile: {
      hasEmail: Boolean(teacher.email),
      hasPhone: Boolean(teacher.phone),
    },
    classes: {
      count: classes.length,
      subjectCount: new Set(classes.map((item) => item.subject_id)).size,
    },
    schedule: { count: workspace?.schedule.length ?? 0 },
    enrollments: { count: workspace?.enrollments.length ?? 0 },
  };
}
