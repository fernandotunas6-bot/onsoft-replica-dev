import { angolaTeachingLevels, type AngolaTeachingLevelId } from "@/lib/angola-academic";

export type AcademicNavAssignment = {
  classGroupId: string;
  className: string;
  gradeName: string;
  courseName?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
};

export type AcademicNavSubject = {
  id: string;
  name: string;
};

export type AcademicNavClass = {
  id: string;
  name: string;
  classTeacher: boolean;
  subjects: AcademicNavSubject[];
};

export type AcademicNavBranch = {
  id: string;
  label: string;
  kind: "course" | "grade";
  classTeacher: boolean;
  classes: AcademicNavClass[];
};

const LEVEL_RESOLVE_ORDER: AngolaTeachingLevelId[] = [
  "ii_ciclo",
  "i_ciclo",
  "pre_escolar",
  "primario",
];

export function resolveTeachingLevelId(gradeName: string): AngolaTeachingLevelId | null {
  for (const id of LEVEL_RESOLVE_ORDER) {
    const level = angolaTeachingLevels.find((item) => item.id === id);
    if (level?.match.test(gradeName)) return id;
  }
  return null;
}

/** Primário e iniciação: professor titular faz a pauta da turma. */
export function isClassTeacherLevel(gradeName: string) {
  const id = resolveTeachingLevelId(gradeName);
  return id === "pre_escolar" || id === "primario";
}

export function gradeClassLabel(gradeName: string) {
  const year = gradeName.match(/(\d{1,2})\s*[ªa]/i);
  if (year) return `${year[1]}ª Classe`;
  if (/inicia/i.test(gradeName)) return "Iniciação";
  const trimmed = gradeName.trim();
  return trimmed && trimmed !== "—" ? trimmed : "Classe";
}

function hasNamedCourse(courseName: string | null | undefined, gradeName: string) {
  const name = String(courseName ?? "").trim();
  if (!name || name === "—") return false;
  return resolveTeachingLevelId(gradeName) === "ii_ciclo";
}

export function buildAcademicNavTree(assignments: AcademicNavAssignment[]): AcademicNavBranch[] {
  const branches = new Map<string, AcademicNavBranch>();

  for (const row of assignments) {
    const classTeacher = isClassTeacherLevel(row.gradeName);
    const useCourse = hasNamedCourse(row.courseName, row.gradeName);
    const label = useCourse ? String(row.courseName).trim() : gradeClassLabel(row.gradeName);
    const id = useCourse ? `course:${label.toLowerCase()}` : `grade:${label.toLowerCase()}`;
    const branch =
      branches.get(id) ??
      ({
        id,
        label,
        kind: useCourse ? "course" : "grade",
        classTeacher,
        classes: [],
      } satisfies AcademicNavBranch);
    if (!branch.classTeacher && classTeacher) branch.classTeacher = true;

    let turma = branch.classes.find((item) => item.id === row.classGroupId);
    if (!turma) {
      turma = { id: row.classGroupId, name: row.className, classTeacher, subjects: [] };
      branch.classes.push(turma);
    }

    if (row.subjectId && row.subjectName) {
      if (!turma.subjects.some((subject) => subject.id === row.subjectId)) {
        turma.subjects.push({ id: row.subjectId, name: row.subjectName });
      }
    }

    branches.set(id, branch);
  }

  return Array.from(branches.values())
    .map((branch) => ({
      ...branch,
      classes: branch.classes
        .map((turma) => ({
          ...turma,
          subjects: turma.subjects.slice().sort((a, b) => a.name.localeCompare(b.name, "pt")),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt"));
}
