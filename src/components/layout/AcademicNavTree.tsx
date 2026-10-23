import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Layers } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NAV_ROW_BASE,
  NAV_ROW_IDLE,
  NavIcon,
  NAV_SUB_LIST,
  NavButtonRow,
  NavLinkRow,
  NavSubheader,
} from "./NavItem";

export function AcademicNavTree({ collapsed = false }: { collapsed?: boolean }) {
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const canRead = canAccessPath("/pedagogica", account.role, account.grants);
  const isTeacher = account.role === "Professor";
  const [branchId, setBranchId] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [openClass, setOpenClass] = useState<string | null>(null);
  useEffect(() => {
    setBranchId(null);
    setOpenClass(null);
    setPopoverOpen(false);
  }, [account.schoolId, account.role, selectedYearId]);

  const teacherQuery = useQuery({
    queryKey: ["academic", "teacher-workspace", "nav", account.schoolId, account.role],
    queryFn: () => getTeacherWorkspace({ data: {} }),
    enabled: canRead && isTeacher,
    retry: false,
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId, account.schoolId, account.role],
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

  const branch = tree.find((item) => item.id === branchId) ?? tree[0]!;
  const content = (
    <div className="space-y-2">
      <Select
        value={branch.id}
        onValueChange={(value) => {
          setBranchId(value);
          setOpenClass(null);
        }}
      >
        <SelectTrigger
          aria-label="Curso ou nível"
          title={branch.label}
          className="w-full min-w-0 border-sidebar-border bg-sidebar text-sidebar-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tree.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AcademicClassList branch={branch} openClass={openClass} onToggleClass={setOpenClass} />
    </div>
  );

  return (
    <div>
      <NavSubheader title="Turmas e disciplinas" collapsed={collapsed} />
      {collapsed ? (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            aria-label="Turmas e disciplinas"
            title="Turmas e disciplinas"
            className={cn(NAV_ROW_BASE, NAV_ROW_IDLE, "min-h-9 justify-center px-1 py-2")}
          >
            <NavIcon icon={Layers} />
            <span className="sr-only">Turmas e disciplinas</span>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={12}
            aria-label="Navegação académica"
            className="max-h-[min(70dvh,var(--radix-popover-content-available-height))] w-72 overflow-y-auto border-sidebar-border bg-sidebar text-sidebar-foreground"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setPopoverOpen(false);
            }}
          >
            {content}
          </PopoverContent>
        </Popover>
      ) : (
        content
      )}
    </div>
  );
}

function AcademicClassList({
  branch,
  openClass,
  onToggleClass,
}: {
  branch: AcademicNavBranch;
  openClass: string | null;
  onToggleClass: (id: string | null) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {branch.classes.map((turma) => (
        <li key={turma.id}>
          {turma.classTeacher ? (
            <NavLinkRow
              to="/pedagogica"
              search={{ tab: "notas", turma: turma.id, pauta: "1" }}
              label={turma.name}
            />
          ) : (
            <>
              <NavButtonRow
                label={turma.name}
                expanded={openClass === turma.id}
                onClick={() => onToggleClass(openClass === turma.id ? null : turma.id)}
                trailing={
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 transition-transform motion-reduce:transition-none",
                      openClass === turma.id && "rotate-180",
                    )}
                  />
                }
              />
              {openClass === turma.id ? (
                <ul className={NAV_SUB_LIST}>
                  {turma.subjects.length === 0 ? (
                    <li className="px-3 py-1 text-sm text-sidebar-muted">
                      Sem disciplina atribuída
                    </li>
                  ) : null}
                  {turma.subjects.map((subject) => (
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
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
