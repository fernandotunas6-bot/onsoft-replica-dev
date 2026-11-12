import { canReadStudentSection } from "@/features/students/student-sections";
import { moduleIcons } from "@/lib/app-icons";
import type { ContextModule } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Ficheiro (Documentos e Arquivos): a página do ficheiro,
 * os arquivos da escola e, quando o servidor devolveu a ligação com o ficheiro,
 * a pasta da turma e os documentos e a ficha do aluno. As ligações vêm do
 * ficheiro lido no servidor, nunca da URL.
 */

function fileFrame(trail: ContextFrame[]): ContextFrame | undefined {
  return [...trail].reverse().find((frame) => frame.type === "file");
}

const fileClassId = (trail: ContextFrame[]) => fileFrame(trail)?.relations?.class;
const fileStudentId = (trail: ContextFrame[]) => fileFrame(trail)?.relations?.student;

const studentBase = {
  group: "Ligado a",
  contexts: ["file"],
  to: "/alunos/$studentId",
  path: (trail: ContextFrame[]) => `/alunos/${fileStudentId(trail) ?? ""}`,
  module: "pessoas",
  available: (trail: ContextFrame[]) => Boolean(fileStudentId(trail)),
} satisfies Partial<ContextNavEntry>;

export const FILE_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    id: "file.overview",
    label: "Detalhes e auditoria",
    icon: moduleIcons.documents,
    group: "Ficheiro",
    contexts: ["file"],
    to: "/arquivos/$fileId",
    path: (trail) => `/arquivos/${fileFrame(trail)?.id ?? ""}`,
    module: "arquivos",
    order: 0,
  },
  {
    id: "file.library",
    label: "Todos os arquivos",
    icon: moduleIcons.files,
    group: "Ficheiro",
    contexts: ["file"],
    to: "/arquivos",
    module: "arquivos",
    order: 10,
  },
  {
    id: "file.class-folder",
    label: "Pasta da turma",
    icon: moduleIcons.files,
    group: "Ligado a",
    contexts: ["file"],
    to: "/arquivos",
    search: (trail) => ({ turma: fileClassId(trail) }),
    module: "arquivos",
    available: (trail) => Boolean(fileClassId(trail)),
    order: 20,
  },
  {
    ...studentBase,
    id: "file.student-documents",
    label: "Documentos do aluno",
    icon: moduleIcons.documents,
    search: () => ({ secao: "documentos" }),
    allow: (role, grants) => canReadStudentSection("documentos", role, grants),
    order: 30,
  },
  {
    ...studentBase,
    id: "file.student",
    label: "Ficha do aluno",
    icon: moduleIcons.profile,
    order: 40,
  },
];

export const FILE_CONTEXT_MODULE: ContextModule = {
  kinds: { file: "Ficheiro" },
  entries: FILE_CONTEXT_ENTRIES,
  // Como `/arquivos`: a equipa da escola (o servidor só serve os Arquivos a estes).
  menuRoles: ["Administrador", "Secretaria", "Tesouraria", "Professor"],
  back: () => ({ to: "/arquivos" }),
};
