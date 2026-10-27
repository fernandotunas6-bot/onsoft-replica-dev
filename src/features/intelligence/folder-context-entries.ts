import { moduleIcons } from "@/lib/app-icons";
import type { ContextModule } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Pasta (Documentos e Arquivos, §5.7): o conteúdo da pasta,
 * a pasta acima e todos os arquivos. A pasta e a de cima vêm do caminho que o
 * servidor devolveu (`listFolderTrail`, com a regra de visibilidade da lista),
 * nunca da URL.
 */

function folderFrame(trail: ContextFrame[]): ContextFrame | undefined {
  return [...trail].reverse().find((frame) => frame.type === "folder");
}

const parentFolderId = (trail: ContextFrame[]) => folderFrame(trail)?.relations?.folder;

export const FOLDER_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    id: "folder.contents",
    label: "Conteúdo da pasta",
    icon: moduleIcons.files,
    group: "Pasta",
    contexts: ["folder"],
    to: "/arquivos",
    search: (trail) => ({ pasta: folderFrame(trail)?.id }),
    module: "arquivos",
    order: 0,
  },
  {
    id: "folder.parent",
    label: "Pasta acima",
    icon: moduleIcons.files,
    group: "Pasta",
    contexts: ["folder"],
    to: "/arquivos",
    search: (trail) => ({ pasta: parentFolderId(trail) }),
    module: "arquivos",
    available: (trail) => Boolean(parentFolderId(trail)),
    order: 5,
  },
  {
    id: "folder.library",
    label: "Todos os arquivos",
    icon: moduleIcons.documents,
    group: "Pasta",
    contexts: ["folder"],
    to: "/arquivos",
    module: "arquivos",
    order: 10,
  },
];

export const FOLDER_CONTEXT_MODULE: ContextModule = {
  kinds: { folder: "Pasta" },
  entries: FOLDER_CONTEXT_ENTRIES,
  // Como `/arquivos` e o ficheiro: a equipa da escola.
  menuRoles: ["Administrador", "Secretaria", "Tesouraria", "Professor"],
  back: () => ({ to: "/arquivos" }),
};
