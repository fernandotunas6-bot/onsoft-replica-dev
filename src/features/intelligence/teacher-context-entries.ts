import { canWriteModule } from "@/features/auth/access-policy";
import { moduleIcons } from "@/lib/app-icons";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Professor: o perfil `/professores/<id>` (dados, turmas e
 * disciplinas atribuídas e o horário da semana), o horário semanal da escola
 * aberto nesse professor, os planos de aula das disciplinas que ele dá e as
 * suas aulas do dia, com a chamada de cada uma.
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
  {
    id: "teacher.lesson-plans",
    label: "Planos de aula",
    icon: moduleIcons.lessonPlans,
    group: "Professor",
    contexts: ["teacher"],
    to: "/planos-aula",
    search: (trail) => ({ professor: teacherId(trail) }),
    module: "pedagogica",
    // Os planos de todas as turmas e o professor de cada disciplina só chegam a quem
    // gere o Pedagógico; o professor já só vê os das suas turmas.
    allow: (role, grants) => canWriteModule(role, "pedagogica", grants),
    order: 20,
  },
  {
    id: "teacher.attendance",
    label: "Presenças",
    icon: moduleIcons.attendance,
    group: "Professor",
    contexts: ["teacher"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "presencas", professor: teacherId(trail) }),
    module: "pedagogica",
    // As aulas do dia e a chamada de cada uma, só desse professor
    // (`listTeacherAttendanceSessions` com `teacherId`).
    allow: (role, grants) => canWriteModule(role, "pedagogica", grants),
    order: 30,
  },
];
