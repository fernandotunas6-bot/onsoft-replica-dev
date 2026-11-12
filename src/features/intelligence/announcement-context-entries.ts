import { moduleIcons } from "@/lib/app-icons";
import type { ContextModule } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Comunicado (contexto Comunicações): a página do comunicado e
 * a lista, onde se redige, edita, arquiva e reenvia. O comunicado vem do servidor,
 * com as regras da lista; a URL só diz qual abrir.
 */

function announcementFrame(trail: ContextFrame[]): ContextFrame | undefined {
  return [...trail].reverse().find((frame) => frame.type === "announcement");
}

export const ANNOUNCEMENT_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    id: "announcement.overview",
    label: "Comunicado",
    icon: moduleIcons.communications,
    group: "Comunicado",
    contexts: ["announcement"],
    to: "/comunicacoes/$announcementId",
    path: (trail) => `/comunicacoes/${announcementFrame(trail)?.id ?? ""}`,
    module: "pedagogica",
    order: 0,
  },
  {
    id: "announcement.list",
    label: "Todos os comunicados",
    icon: moduleIcons.communications,
    group: "Comunicado",
    contexts: ["announcement"],
    to: "/comunicacoes",
    module: "pedagogica",
    order: 10,
  },
];

export const ANNOUNCEMENT_CONTEXT_MODULE: ContextModule = {
  kinds: { announcement: "Comunicado" },
  entries: ANNOUNCEMENT_CONTEXT_ENTRIES,
  // O pessoal que trabalha os comunicados; o aluno e o encarregado lêem a página
  // sem menu, como lêem a lista.
  menuRoles: ["Administrador", "Secretaria", "Professor"],
  back: () => ({ to: "/comunicacoes" }),
};
