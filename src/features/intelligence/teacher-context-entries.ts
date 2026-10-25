import { canWriteModule } from "@/features/auth/access-policy";
import { moduleIcons } from "@/lib/app-icons";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Professor: o perfil `/professores/<id>` (dados, turmas e
 * disciplinas atribuídas e o horário da semana) e o horário semanal da escola
 * aberto nesse professor. Planos de aula e presenças entram quando as páginas
 * aceitarem filtrar por professor.
 */

/** O professor mais interior do caminho; o tipo do contexto garante que existe. */
function teacherId(trail: ContextFrame[]): string {
  return [...trail].reverse().find((frame) => frame.type === "teacher")?.id ?? "";
}

export const TEACHER_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    id: "teacher.overview",
    label: "Perfil e turmas",
    icon: moduleIcons.profile,
    group: "Professor",
    contexts: ["teacher"],
    to: "/professores/$teacherId",
    path: (trail) => `/professores/${teacherId(trail)}`,
    module: "pessoas",
    order: 0,
  },
  {
    id: "teacher.timetable",
    label: "Horário semanal",
    icon: moduleIcons.schedule,
    group: "Professor",
    contexts: ["teacher"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "horarios", professor: teacherId(trail) }),
    module: "pedagogica",
    // A vista por professor do horário da escola só tem a lista de professores para
    // quem gere o Pedagógico (`listTeachers` em `/pedagogica`); o professor vê o
    // seu horário no perfil.
    allow: (role, grants) => canWriteModule(role, "pedagogica", grants),
    order: 10,
  },
];
