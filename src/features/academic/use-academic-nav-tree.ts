import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import {
  getTeacherWorkspace,
  listPedagogicalWorkspace,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import {
  buildAcademicNavTree,
  isClassTeacherLevel,
  type AcademicNavAssignment,
  type AcademicNavBranch,
} from "@/lib/academic-nav";

/**
 * Turmas e disciplinas que o servidor devolve à conta na escola activa: as do
 * professor (pelas suas atribuições) ou as da escola (equipa). A árvore académica
 * e o menu da entidade usam as mesmas chaves, por isso o React Query faz um só
 * pedido. As chaves levam escola e papel; trocar de escola repõe as consultas.
 */
export function useAcademicNavTree({ enabled }: { enabled: boolean }): {
  tree: AcademicNavBranch[];
  schoolId: string | null;
} {
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const isTeacher = account.role === "Professor";

  const teacherQuery = useQuery({
    queryKey: ["academic", "teacher-workspace", "nav", account.schoolId, account.role],
    queryFn: () => getTeacherWorkspace({ data: {} }),
    enabled: enabled && isTeacher,
    retry: false,
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId, account.schoolId, account.role],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    enabled: enabled && !isTeacher,
    retry: false,
  });

  const tree = useMemo(() => {
    if (isTeacher) {
      const classes = teacherQuery.data?.classes ?? [];
      return buildAcademicNavTree(
        classes.map((row) => ({
          classGroupId: row.id,
          className: row.name,
          gradeName: row.grade_name ?? row.name,
          courseName: row.course_name,
          subjectId: row.subject_id,
          subjectName: row.subject_name,
        })),
      );
    }
    const groups = workspaceQuery.data?.classGroups ?? [];
    const subjects = workspaceQuery.data?.subjects ?? [];
    const classSubjects = workspaceQuery.data?.classSubjects ?? [];
    const assignments: AcademicNavAssignment[] = [];
    for (const group of groups) {
      const linked = classSubjects.filter((row) => row.class_group_id === group.id);
      if (linked.length > 0) {
        for (const row of linked) {
          assignments.push({
            classGroupId: group.id,
            className: group.name,
            gradeName: group.grade_name,
            courseName: group.course_name,
            subjectId: row.subject_id,
            subjectName: row.subject_name,
            teacherId: row.teacher_id,
          });
        }
      } else if (subjects.length > 0 && !isClassTeacherLevel(group.grade_name)) {
        for (const subject of subjects) {
          assignments.push({
            classGroupId: group.id,
            className: group.name,
            gradeName: group.grade_name,
            courseName: group.course_name,
            subjectId: String(subject.id),
            subjectName: String(subject.name),
          });
        }
      } else {
        assignments.push({
          classGroupId: group.id,
          className: group.name,
          gradeName: group.grade_name,
          courseName: group.course_name,
        });
      }
    }
    return buildAcademicNavTree(assignments);
  }, [isTeacher, teacherQuery.data, workspaceQuery.data]);

  return { tree, schoolId: account.schoolId ?? null };
}
