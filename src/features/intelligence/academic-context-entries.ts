import { canWriteModule, type ApplicationRole } from "@/features/auth/access-policy";
import { moduleIcons } from "@/lib/app-icons";
import type { ContextModule } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import { parseSubjectOfferingId } from "./context-resolver";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto académico (turma e disciplina numa turma), primeiro
 * piloto do SIGA Context Engine. Só rotas e separadores que já existem e já
 * filtram por `turma` e `disciplina`, a ficha da turma e os trabalhos.
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

/**
 * As entradas académicas são de gestão da turma (pauta, chamada, planos). As
 * regras de rota deixam o aluno e o encarregado abrir `/pedagogica` e
 * `/planos-aula` para o que é seu, por isso o menu da turma fica para a equipa.
 */
export const ACADEMIC_STAFF_ROLES: readonly ApplicationRole[] = [
  "Administrador",
  "Secretaria",
  "Professor",
];

/** A ficha da turma do caminho (`/pedagogica/turmas/<id>`). */
function classProfilePath(trail: ContextFrame[]): string {
  return `/pedagogica/turmas/${academicIdsFromTrail(trail).turma ?? ""}`;
}

/** O professor da disciplina do caminho, quando o servidor o devolveu com ela. */
function subjectTeacherId(trail: ContextFrame[]): string | undefined {
  const subject = [...trail].reverse().find((frame) => frame.type === "subject-offering");
  return subject?.relations?.teacher;
}

export const ACADEMIC_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    id: "class.profile",
    label: "Ficha da turma",
    icon: moduleIcons.classes,
    group: "Turma",
    contexts: ["class", "subject-offering"],
    to: "/pedagogica/turmas/$classGroupId",
    path: classProfilePath,
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
    order: 0,
  },
  {
    id: "class.students",
    label: "Alunos da turma",
    icon: moduleIcons.students,
    group: "Turma",
    contexts: ["class", "subject-offering"],
    to: "/pedagogica/turmas/$classGroupId",
    path: classProfilePath,
    search: () => ({ secao: "alunos" }),
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
    order: 5,
  },
  {
    // Do resultado final no histórico para o ano seguinte. O servidor só a serve a
    // quem grava em Pessoas, na Administração e na Secretaria (`getRenewalPlan`).
    id: "class.renewal",
    label: "Renovar matrículas",
    icon: moduleIcons.enrollment,
    group: "Turma",
    contexts: ["class"],
    to: "/pedagogica/turmas/$turmaId/renovar",
    path: (trail) => `${classProfilePath(trail)}/renovar`,
    module: "pedagogica",
    roles: ["Administrador", "Secretaria"],
    allow: (role, grants) => canWriteModule(role, "pessoas", grants),
    order: 6,
  },
  {
    // O perfil do professor que dá a disciplina nesta turma (disciplinas, turmas e
    // horário dele). Só aparece quando a disciplina tem professor atribuído.
    id: "subject.teacher",
    label: "Professor responsável",
    icon: moduleIcons.profile,
    group: "Turma",
    contexts: ["subject-offering"],
    to: "/professores/$teacherId",
    path: (trail) => `/professores/${subjectTeacherId(trail) ?? ""}`,
    available: (trail) => Boolean(subjectTeacherId(trail)),
    module: "pessoas",
    roles: ACADEMIC_STAFF_ROLES,
    order: 7,
  },
  {
    id: "subject.grades",
    label: "Avaliações e notas",
    icon: moduleIcons.grades,
    group: "Avaliação",
    contexts: ["subject-offering"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "notas", ...academicIdsFromTrail(trail), pauta: "1" }),
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
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
    roles: ACADEMIC_STAFF_ROLES,
    order: 10,
  },
  {
    // Só com a turma, as aulas do dia dessa turma, cada uma com a chamada.
    id: "class.attendance",
    label: "Presenças",
    icon: moduleIcons.attendance,
    group: "Acompanhamento",
    contexts: ["class"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "presencas", turma: academicIdsFromTrail(trail).turma }),
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
    order: 20,
  },
  {
    // Com turma e disciplina, o separador abre a chamada dessa aula.
    id: "academic.attendance",
    label: "Presenças",
    icon: moduleIcons.attendance,
    group: "Acompanhamento",
    contexts: ["subject-offering"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "presencas", ...academicIdsFromTrail(trail) }),
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
    order: 20,
  },
  {
    // O horário é da turma: da disciplina abre-se o horário da turma.
    id: "class.timetable",
    label: "Horário da turma",
    icon: moduleIcons.schedule,
    group: "Acompanhamento",
    contexts: ["class", "subject-offering"],
    to: "/pedagogica",
    search: (trail) => ({ tab: "horarios", turma: academicIdsFromTrail(trail).turma }),
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
    order: 25,
  },
  {
    // Os alertas e a análise de risco são por turma: da disciplina abrem-se os da turma.
    id: "class.risk",
    label: "Alunos em risco",
    icon: moduleIcons.studentRisk,
    group: "Acompanhamento",
    contexts: ["class", "subject-offering"],
    to: "/pedagogica/risco",
    search: (trail) => ({ turma: academicIdsFromTrail(trail).turma }),
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
    order: 28,
  },
  {
    // Os relatórios académicos filtram por turma: da disciplina abrem-se os da turma.
    id: "class.reports",
    label: "Relatórios da turma",
    icon: moduleIcons.academicReports,
    group: "Acompanhamento",
    contexts: ["class", "subject-offering"],
    to: "/relatorios/academicos",
    search: (trail) => ({ turma: academicIdsFromTrail(trail).turma }),
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
    order: 27,
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
    roles: ACADEMIC_STAFF_ROLES,
    order: 30,
  },
  {
    // As tarefas criam-se no detalhe da aula; aqui juntam-se por turma ou disciplina.
    id: "academic.tasks",
    label: "Trabalhos",
    icon: moduleIcons.classTasks,
    group: "Ensino",
    contexts: ["class", "subject-offering"],
    to: "/pedagogica/trabalhos",
    search: (trail) => academicIdsFromTrail(trail),
    module: "pedagogica",
    roles: ACADEMIC_STAFF_ROLES,
    order: 35,
  },
  {
    id: "academic.files",
    label: "Materiais e ficheiros",
    icon: moduleIcons.files,
    group: "Ensino",
    contexts: ["class", "subject-offering"],
    to: "/arquivos",
    // Os ficheiros estão por turma: da disciplina abre-se a pasta da turma.
    search: (trail) => ({ turma: academicIdsFromTrail(trail).turma }),
    module: "arquivos",
    roles: ACADEMIC_STAFF_ROLES,
    order: 40,
  },
];

/** Turma e disciplina: o menu é da equipa académica. */
export const ACADEMIC_CONTEXT_MODULE: ContextModule = {
  kinds: { class: "Turma", "subject-offering": "Disciplina" },
  entries: ACADEMIC_CONTEXT_ENTRIES,
  menuRoles: ACADEMIC_STAFF_ROLES,
  // A ficha e os trabalhos da turma abrem-se da lista de turmas.
  back: (_context, pathname) =>
    pathname.startsWith("/pedagogica/turmas/") || pathname === "/pedagogica/trabalhos"
      ? { to: "/pedagogica", search: { tab: "turmas" } }
      : null,
};
