import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, GraduationCap, Layers } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { NAV_SUB_LIST, NavButtonRow, NavLinkRow, NavSubheader } from "./NavItem";

export function AcademicNavTree({ collapsed = false }: { collapsed?: boolean }) {
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const canRead = canAccessPath("/pedagogica", account.role, account.grants);
  const isTeacher = account.role === "Professor";
  const [openBranch, setOpenBranch] = useState<string | null>(null);
  const [openClass, setOpenClass] = useState<string | null>(null);

  const teacherQuery = useQuery({
    queryKey: ["academic", "teacher-workspace", "nav"],
    queryFn: () => getTeacherWorkspace({ data: {} }),
    enabled: canRead && isTeacher,
    retry: false,
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    enabled: canRead && !isTeacher,
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

  if (!canRead || tree.length === 0) return null;

  const flyout = collapsed ? (
    <div className="pointer-events-none absolute left-full top-0 z-50 hidden pl-2 group-hover/fly:block group-focus-within/fly:block">
      <div className="pointer-events-auto max-h-[70vh] min-w-56 overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar p-2 shadow-float">
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold text-sidebar-muted">Curso / Nível</p>
        <BranchList
          tree={tree}
          openBranch={openBranch}
          openClass={openClass}
          onToggleBranch={setOpenBranch}
          onToggleClass={setOpenClass}
        />
      </div>
    </div>
  ) : null;

  return (
    <div>
      <NavSubheader title="Curso / Nível" collapsed={collapsed} />
      {collapsed ? (
        <ul className="space-y-0.5">
          <li className="group/fly relative">
            <NavButtonRow label="Curso / Nível" icon={Layers} collapsed active={false} />
            {flyout}
          </li>
        </ul>
      ) : (
        <BranchList
          tree={tree}
          openBranch={openBranch}
          openClass={openClass}
          onToggleBranch={setOpenBranch}
          onToggleClass={setOpenClass}
        />
      )}
    </div>
  );
}

function BranchList({
  tree,
  openBranch,
  openClass,
  onToggleBranch,
  onToggleClass,
}: {
  tree: AcademicNavBranch[];
  openBranch: string | null;
  openClass: string | null;
  onToggleBranch: (id: string | null) => void;
  onToggleClass: (id: string | null) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {tree.map((branch) => {
        const expanded = openBranch === branch.id;
        return (
          <li key={branch.id}>
            <NavButtonRow
              label={branch.label}
              icon={branch.kind === "course" ? GraduationCap : BookOpen}
              expanded={expanded}
              onClick={() => {
                onToggleBranch(expanded ? null : branch.id);
                onToggleClass(null);
              }}
              trailing={
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 opacity-50 transition-transform duration-200",
                    expanded && "rotate-180",
                  )}
                />
              }
            />
            {expanded ? (
              <ul className={NAV_SUB_LIST}>
                {branch.classes.map((turma) => {
                  const classOpen = openClass === turma.id;
                  if (turma.classTeacher) {
                    return (
                      <li key={turma.id}>
                        <NavLinkRow
                          to="/pedagogica"
                          search={{ tab: "notas", turma: turma.id, pauta: "1" }}
                          label={turma.name}
                          depth="sub"
                        />
                      </li>
                    );
                  }
                  return (
                    <li key={turma.id}>
                      <NavButtonRow
                        label={turma.name}
                        depth="sub"
                        expanded={classOpen}
                        onClick={() => onToggleClass(classOpen ? null : turma.id)}
                        trailing={
                          <ChevronDown
                            aria-hidden
                            className={cn(
                              "size-3.5 shrink-0 opacity-50 transition-transform",
                              classOpen && "rotate-180",
                            )}
                          />
                        }
                      />
                      {classOpen ? (
                        <ul className={NAV_SUB_LIST}>
                          {turma.subjects.length === 0 ? (
                            <li className="px-3 py-1 text-[0.6875rem] text-sidebar-muted">
                              Sem disciplina atribuída
                            </li>
                          ) : (
                            turma.subjects.map((subject) => (
                              <li key={subject.id}>
                                <NavLinkRow
                                  to="/pedagogica"
                                  search={{
                                    tab: "notas",
                                    turma: turma.id,
                                    disciplina: subject.id,
                                    pauta: "1",
                                  }}
                                  label={subject.name}
                                  depth="sub"
                                />
                              </li>
                            ))
                          )}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
