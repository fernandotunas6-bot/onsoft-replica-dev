import { moduleIcons } from "@/lib/app-icons";
import {
  canReadStudentSection,
  STUDENT_SECTIONS,
  type StudentSection,
} from "@/features/students/student-sections";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Aluno: as secções da ficha `/alunos/<id>`, cada uma com
 * URL própria (`?secao=`). «Ficha completa» é a página de sempre. Comunicação entra
 * quando tiver conteúdo na ficha.
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
];
