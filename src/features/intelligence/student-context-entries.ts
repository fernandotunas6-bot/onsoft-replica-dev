import { canAccessPath } from "@/features/auth/access-policy";
import { moduleIcons } from "@/lib/app-icons";
import {
  canReadStudentSection,
  STUDENT_SECTIONS,
  type StudentSection,
} from "@/features/students/student-sections";
import type { ContextModule } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Aluno: as secções da ficha `/alunos/<id>`, cada uma com
 * URL própria (`?secao=`). «Ficha completa» é a página de sempre. Comunicação entra
 * quando tiver conteúdo na ficha. Com a turma da matrícula, o menu leva também à
 * turma, aos trabalhos e ao horário dela (a turma passa a ser o contexto).
 */

/** O aluno mais interior do caminho; o tipo do contexto garante que existe. */
function studentPath(trail: ContextFrame[]): string {
  const student = [...trail].reverse().find((frame) => frame.type === "student");
  return `/alunos/${student?.id ?? ""}`;
}

const SECTION_ICONS: Record<StudentSection, ContextNavEntry["icon"]> = {
  identificacao: moduleIcons.accessCards,
  academico: moduleIcons.students,
  financeiro: moduleIcons.finance,
  documentos: moduleIcons.documents,
  historico: moduleIcons.academicReports,
};

const base = {
  group: "Ficha do aluno",
  contexts: ["student"],
  to: "/alunos/$studentId",
  path: studentPath,
  module: "pessoas",
} satisfies Partial<ContextNavEntry>;

/** A turma da matrícula, que a ficha leu do servidor com o aluno. */
function studentClassId(trail: ContextFrame[]): string | undefined {
  return [...trail].reverse().find((frame) => frame.type === "student")?.relations?.class;
}

/**
 * Da ficha para a turma: só para a secretaria e a direcção, que vêem todas as
 * turmas da escola; o professor chega às suas pelo menu académico.
 */
const classBase = {
  group: "Turma do aluno",
  contexts: ["student"],
  module: "pedagogica",
  roles: ["Administrador", "Secretaria"],
  available: (trail: ContextFrame[]) => Boolean(studentClassId(trail)),
} satisfies Partial<ContextNavEntry>;

export const STUDENT_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  { ...base, id: "student.overview", label: "Ficha completa", icon: moduleIcons.profile, order: 0 },
  ...STUDENT_SECTIONS.map((section, index): ContextNavEntry => ({
    ...base,
    id: `student.${section.id}`,
    label: section.label,
    icon: SECTION_ICONS[section.id],
    search: () => ({ secao: section.id }),
    allow: (role, grants) => canReadStudentSection(section.id, role, grants),
    order: (index + 1) * 10,
  })),
  {
    // Receber e anular são da lista de faturas (`/faturas`, da Administração e da
    // Tesouraria): o filtro `aluno` mostra só as deste aluno.
    id: "student.invoices",
    label: "Receber pagamentos",
    icon: moduleIcons.receipts,
    group: "Ficha do aluno",
    contexts: ["student"],
    to: "/faturas",
    search: (trail) => ({
      aluno: [...trail].reverse().find((frame) => frame.type === "student")?.id,
    }),
    module: "financeiro",
    // É uma entrada da ficha: só a quem também a abre (a tesouraria vai pela fatura).
    allow: (role, grants) => canAccessPath("/alunos", role, grants),
    order: 35,
  },
  {
    ...classBase,
    id: "student.class",
    label: "Ficha da turma",
    icon: moduleIcons.classes,
    to: "/pedagogica/turmas/$turmaId",
    path: (trail) => `/pedagogica/turmas/${studentClassId(trail) ?? ""}`,
    order: 100,
  },
  {
    ...classBase,
    id: "student.class-tasks",
    label: "Trabalhos da turma",
    icon: moduleIcons.classTasks,
    to: "/pedagogica/trabalhos",
    search: (trail) => ({ turma: studentClassId(trail) }),
    order: 110,
  },
  {
    ...classBase,
    id: "student.class-timetable",
    label: "Horário da turma",
    icon: moduleIcons.schedule,
    to: "/pedagogica",
    search: (trail) => ({ tab: "horarios", turma: studentClassId(trail) }),
    order: 120,
  },
];

export const STUDENT_CONTEXT_MODULE: ContextModule = {
  kinds: { student: "Aluno" },
  entries: STUDENT_CONTEXT_ENTRIES,
  // O encarregado abre `/alunos/<id>` do seu educando, mas o menu é de gestão.
  menuRoles: ["Administrador", "Secretaria", "Professor"],
  back: () => ({ to: "/alunos" }),
};
