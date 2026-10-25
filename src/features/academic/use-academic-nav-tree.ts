import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { canAccessPath } from "@/features/auth/access-policy";
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
 * Turmas e disciplinas autorizadas da escola activa, lidas do servidor.
 *
 * A mesma fonte serve a árvore «Turmas e disciplinas» e a validação do contexto
 * da sidebar: as chaves de consulta são as mesmas, por isso o React Query faz
 * uma só leitura. `enabled: false` não lê nada (páginas sem turma na URL).
 */
export function useAcademicNavTree({ enabled = true }: { enabled?: boolean } = {}): {
  tree: AcademicNavBranch[];
  canRead: boolean;
  schoolId: string | null;
} {
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const canRead = canAccessPath("/pedagogica", account.role, account.grants);
  const isTeacher = account.role === "Professor";
  const active = canRead && enabled;

  const teacherQuery = useQuery({
    queryKey: ["academic", "teacher-workspace", "nav", account.schoolId, account.role],
    queryFn: () => getTeacherWorkspace({ data: {} }),
    enabled: active && isTeacher,
    retry: false,
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId, account.schoolId, account.role],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    enabled: active && !isTeacher,
    retry: false,
  });

  const tree = useMemo(() => {
    if (!active) return [];
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
  }, [active, isTeacher, teacherQuery.data, workspaceQuery.data]);

  return { tree, canRead, schoolId: account.schoolId ?? null };
}
