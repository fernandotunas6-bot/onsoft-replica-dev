import { moduleIcons } from "@/lib/app-icons";
import { ACADEMIC_STAFF_ROLES } from "./academic-context-entries";
import type { ContextModule } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import { parseSubjectOfferingId } from "./context-resolver";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Trabalho (§5.2 do Prompt Master): o trabalho fica debaixo
 * da disciplina da turma. O menu mostra as entregas por estado e, da disciplina,
 * os outros trabalhos, as notas, as presenças e a ficha da turma.
 *
 * A turma e a disciplina vêm do trabalho lido no servidor (`listTaskSubmissions`,
 * que já recusa quem não é professor da disciplina nem da direcção), nunca da URL.
 */

/** Valores de `?estado=` na página das entregas (`/pedagogica/tarefas/$taskId`). */
export const TASK_SUBMISSION_STATES = ["por-entregar", "por-devolver", "devolvidas"] as const;
export type TaskSubmissionState = (typeof TASK_SUBMISSION_STATES)[number];

function taskFrame(trail: ContextFrame[]): ContextFrame | undefined {
  return [...trail].reverse().find((frame) => frame.type === "task");
}

/** Turma e disciplina do trabalho, devolvidas pelo servidor com ele. */
export function taskAcademicIds(trail: ContextFrame[]): { turma?: string; disciplina?: string } {
  const offering = taskFrame(trail)?.relations?.["subject-offering"];
  const parsed = offering ? parseSubjectOfferingId(offering) : null;
  return parsed ? { turma: parsed.classId, disciplina: parsed.subjectId } : {};
}

const hasSubject = (trail: ContextFrame[]) => Boolean(taskAcademicIds(trail).disciplina);

const submissionsBase = {
  icon: moduleIcons.classTasks,
  group: "Trabalho",
  contexts: ["task"],
  to: "/pedagogica/tarefas/$taskId",
  path: (trail: ContextFrame[]) => `/pedagogica/tarefas/${taskFrame(trail)?.id ?? ""}`,
  module: "pedagogica",
  roles: ACADEMIC_STAFF_ROLES,
} satisfies Partial<ContextNavEntry>;

const subjectBase = {
  group: "Disciplina",
  contexts: ["task"],
  module: "pedagogica",
  roles: ACADEMIC_STAFF_ROLES,
  available: hasSubject,
} satisfies Partial<ContextNavEntry>;

export const TASK_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    ...submissionsBase,
    id: "task.submissions",
    label: "Entregas e correcção",
    order: 0,
  },
  {
    ...submissionsBase,
    id: "task.pending",
    label: "Por entregar",
    icon: moduleIcons.attendance,
    search: () => ({ estado: "por-entregar" }),
    order: 1,
  },
  {
    ...submissionsBase,
    id: "task.to-return",
    label: "Por devolver",
    icon: moduleIcons.grades,
    search: () => ({ estado: "por-devolver" }),
    order: 2,
  },
  {
    ...submissionsBase,
    id: "task.returned",
    label: "Devolvidas",
    icon: moduleIcons.grades,
    search: () => ({ estado: "devolvidas" }),
    order: 3,
  },
  {
    ...subjectBase,
    id: "task.subject-tasks",
    label: "Trabalhos da disciplina",
    icon: moduleIcons.classTasks,
    to: "/pedagogica/trabalhos",
    search: (trail) => taskAcademicIds(trail),
    order: 10,
  },
  {
    ...subjectBase,
    id: "task.subject-grades",
    label: "Avaliações e notas",
    icon: moduleIcons.grades,
    to: "/pedagogica",
    search: (trail) => ({ tab: "notas", ...taskAcademicIds(trail), pauta: "1" }),
    order: 11,
  },
  {
    ...subjectBase,
    id: "task.subject-attendance",
    label: "Presenças",
    icon: moduleIcons.attendance,
    to: "/pedagogica",
    search: (trail) => ({ tab: "presencas", ...taskAcademicIds(trail) }),
    order: 12,
  },
  {
    ...subjectBase,
    id: "task.class-profile",
    label: "Ficha da turma",
    icon: moduleIcons.classes,
    to: "/pedagogica/turmas/$turmaId",
    path: (trail) => `/pedagogica/turmas/${taskAcademicIds(trail).turma ?? ""}`,
    order: 13,
  },
];

export const TASK_CONTEXT_MODULE: ContextModule = {
  kinds: { task: "Trabalho" },
  entries: TASK_CONTEXT_ENTRIES,
  // Como o servidor das entregas: direcção, secretaria e o professor da disciplina.
  menuRoles: ACADEMIC_STAFF_ROLES,
  // «Voltar» leva aos trabalhos da disciplina, de onde o trabalho se abre.
  back: (context) => {
    const ids = taskAcademicIds(context.trail);
    return ids.disciplina
      ? { to: "/pedagogica/trabalhos", search: ids }
      : { to: "/pedagogica/trabalhos" };
  },
};
