import { moduleIcons } from "@/lib/app-icons";
import type { ContextNavEntry } from "./context-registry";
import { parseSubjectOfferingId } from "./context-resolver";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto académico (turma e disciplina numa turma), primeiro
 * piloto do SIGA Context Engine. Só rotas e separadores que já existem e já
 * aceitam `turma` e `disciplina`; Trabalhos entra quando tiver ecrã próprio.
 */

/** Turma e disciplina do caminho; a disciplina nunca vem sem a sua turma. */
export function academicIdsFromTrail(trail: ContextFrame[]): {
  turma?: string;
  disciplina?: string;
} {
  let turma: string | undefined;
  let disciplina: string | undefined;
  for (const frame of trail) {
    if (frame.type === "class") {
      turma = frame.id;
      disciplina = undefined;
    } else if (frame.type === "subject-offering") {
      const parsed = parseSubjectOfferingId(frame.id);
      if (!parsed) continue;
      turma = parsed.classId;
      disciplina = parsed.subjectId;
    }
  }
  return { turma, disciplina };
}

export const ACADEMIC_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    id: "subject.grades",
    label: "Avaliações e notas",
    icon: moduleIcons.grades,
    group: "Avaliação",
    contexts: ["subject-offering"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "notas", ...academicIdsFromTrail(trail), pauta: "1" }),
    module: "pedagogica",
    order: 10,
  },
  {
    id: "class.grades",
    label: "Pauta da turma",
    icon: moduleIcons.grades,
    group: "Avaliação",
    contexts: ["class"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "notas", turma: academicIdsFromTrail(trail).turma, pauta: "1" }),
    module: "pedagogica",
    order: 10,
  },
  {
    id: "academic.attendance",
    label: "Presenças",
    icon: moduleIcons.attendance,
    group: "Acompanhamento",
    contexts: ["class", "subject-offering"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "presencas", ...academicIdsFromTrail(trail) }),
    module: "pedagogica",
    order: 20,
  },
  {
    id: "academic.lesson-plans",
    label: "Planos de aula",
    icon: moduleIcons.lessonPlans,
    group: "Ensino",
    contexts: ["class", "subject-offering"],
    to: "/planos-aula",
    search: (trail) => academicIdsFromTrail(trail),
    module: "pedagogica",
    order: 30,
  },
];
