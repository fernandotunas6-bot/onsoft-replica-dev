/**
 * SIGA Context Engine — registo declarativo de destinos por contexto.
 *
 * Cada entrada aponta para uma rota que JÁ existe e aceita os parâmetros
 * indicados no seu `validateSearch`. Nada aqui cria páginas: uma função sem
 * ecrã fica registada com `status: "partial"` e não aparece no menu.
 *
 * O menu é só apresentação. Cada destino passa por `canAccessPath` (papel,
 * permissões por módulo e plano) e o servidor volta a validar escola, turma e
 * disciplina em cada pedido.
 *
 * Contrato e inventário: docs/specs/SIGA_CONTEXT_ENGINE_2026.md
 */
import type { Plan } from "@/features/saas/types";
import { canAccessPath, type ModuleGrantMap } from "@/features/auth/access-policy";
import type { ContextEntity, ContextEntityType, ContextFrame } from "./context-frame";

export type ContextGroupId = "ensino" | "trabalhos" | "avaliacao" | "acompanhamento" | "perfil";

export const CONTEXT_GROUP_LABELS: Record<ContextGroupId, string> = {
  perfil: "Perfil",
  ensino: "Ensino",
  trabalhos: "Trabalhos",
  avaliacao: "Avaliação",
  acompanhamento: "Acompanhamento",
};

const GROUP_ORDER: ContextGroupId[] = [
  "perfil",
  "ensino",
  "trabalhos",
  "avaliacao",
  "acompanhamento",
];

/** Implementado: rota real com dados reais. Parcial: backend sem ecrã próprio. */
export type ContextDestinationStatus = "implemented" | "partial";

export type ContextLink = {
  to: string;
  search?: Record<string, string>;
};

export interface ContextDestination {
  /** Identificador estável (memória, testes, analytics). */
  id: string;
  label: string;
  /** Nome do ícone lucide; a camada de UI resolve o componente. */
  icon: string;
  group: ContextGroupId;
  contexts: ContextEntityType[];
  status: ContextDestinationStatus;
  /** Menor aparece primeiro dentro do grupo. */
  priority: number;
  /**
   * Restrição adicional por papel (só pode estreitar `canAccessPath`, nunca
   * alargar). Ex.: planos de aula na disciplina não são do aluno.
   */
  roles?: readonly string[];
  /** Constrói o destino tipado a partir da entidade activa. */
  link: (entity: ContextEntity) => ContextLink | null;
  /** Texto para estado vazio na página de destino. */
  emptyLabel: string;
}

const STAFF_TEACHING = ["Administrador", "Secretaria", "Professor"] as const;

function classOf(entity: ContextEntity) {
  return entity.type === "subject" || entity.type === "class" ? entity.classGroupId : null;
}

function subjectSearch(entity: ContextEntity): Record<string, string> | null {
  if (entity.type === "subject") {
    return { turma: entity.classGroupId, disciplina: entity.subjectId };
  }
  if (entity.type === "class") return { turma: entity.classGroupId };
  return null;
}

export const CONTEXT_DESTINATIONS: ContextDestination[] = [
  {
    id: "student.profile",
    label: "Ficha do aluno",
    icon: "IdCard",
    group: "perfil",
    contexts: ["student"],
    status: "implemented",
    priority: 0,
    link: (entity) => (entity.type === "student" ? { to: `/alunos/${entity.studentId}` } : null),
    emptyLabel: "Aluno sem dados.",
  },
  {
    id: "teacher.profile",
    label: "Perfil do professor",
    icon: "IdCard",
    group: "perfil",
    contexts: ["teacher"],
    status: "implemented",
    priority: 0,
    link: (entity) =>
      entity.type === "teacher" ? { to: `/professores/${entity.teacherId}` } : null,
    emptyLabel: "Professor sem dados.",
  },
  {
    id: "subject.lesson-plans",
    label: "Planos de aula",
    icon: "BookOpen",
    group: "ensino",
    contexts: ["subject", "class"],
    status: "implemented",
    priority: 10,
    roles: STAFF_TEACHING,
    link: (entity) => {
      const search = subjectSearch(entity);
      return search ? { to: "/planos-aula", search } : null;
    },
    emptyLabel: "Ainda não há planos de aula.",
  },
  {
    id: "subject.materials",
    label: "Materiais e ficheiros",
    icon: "FolderOpen",
    group: "ensino",
    contexts: ["subject", "class"],
    status: "implemented",
    priority: 20,
    link: (entity) => {
      const turma = classOf(entity);
      return turma ? { to: "/arquivos", search: { turma } } : null;
    },
    emptyLabel: "Sem materiais nesta turma.",
  },
  {
    // `siga_class_tasks` (createClassTask/archiveClassTask) e
    // `siga_class_task_submissions` (#331) existem; falta a página de lista
    // e de entregas (SPEC #329). Não aparece no menu até existir.
    id: "subject.tasks",
    label: "Trabalhos e tarefas",
    icon: "ClipboardList",
    group: "trabalhos",
    contexts: ["subject"],
    status: "partial",
    priority: 10,
    link: () => null,
    emptyLabel: "Ainda não há trabalhos nesta disciplina.",
  },
  {
    id: "subject.grades",
    label: "Avaliações e notas",
    icon: "ClipboardCheck",
    group: "avaliacao",
    contexts: ["subject", "class"],
    status: "implemented",
    priority: 10,
    roles: STAFF_TEACHING,
    // Igual ao destino que a árvore académica já usa (pauta da turma/disciplina).
    link: (entity) => {
      const search = subjectSearch(entity);
      return search ? { to: "/pedagogica", search: { tab: "notas", ...search, pauta: "1" } } : null;
    },
    emptyLabel: "Sem avaliações lançadas.",
  },
  {
    id: "subject.attendance",
    label: "Presenças",
    icon: "CalendarCheck",
    group: "acompanhamento",
    contexts: ["subject", "class"],
    status: "implemented",
    priority: 10,
    link: (entity) => {
      const search = subjectSearch(entity);
      return search ? { to: "/professor/presenca", search } : null;
    },
    emptyLabel: "Sem aulas registadas.",
  },
];

export type ContextNavItem = ContextLink & {
  id: string;
  label: string;
  icon: string;
};

export type ContextNavGroup = {
  id: ContextGroupId;
  title: string;
  items: ContextNavItem[];
};

export interface BuildContextNavigationInput {
  frame: ContextFrame;
  grants: ModuleGrantMap;
  plan?: Plan | null;
  /** Permite a um módulo acrescentar entradas sem alterar este ficheiro. */
  registry?: ContextDestination[];
}

/**
 * Menu contextual da entidade activa: só destinos implementados, compatíveis com
 * a entidade, autorizados para o papel/permissões/plano e com link construível.
 */
export function buildContextNavigation({
  frame,
  grants,
  plan,
  registry = CONTEXT_DESTINATIONS,
}: BuildContextNavigationInput): ContextNavGroup[] {
  const entity = frame.entity;
  if (!entity || !frame.schoolId) return [];

  const items = registry
    .filter((entry) => entry.status === "implemented")
    .filter((entry) => entry.contexts.includes(entity.type))
    .filter((entry) => !entry.roles || entry.roles.includes(frame.role))
    .flatMap((entry) => {
      const link = entry.link(entity);
      if (!link || !canAccessPath(link.to, frame.role, grants, plan)) return [];
      return [{ entry, link }];
    });

  return GROUP_ORDER.map((group) => ({
    id: group,
    title: CONTEXT_GROUP_LABELS[group],
    items: items
      .filter(({ entry }) => entry.group === group)
      .sort((a, b) => a.entry.priority - b.entry.priority)
      .map(({ entry, link }) => ({ id: entry.id, label: entry.label, icon: entry.icon, ...link })),
  })).filter((group) => group.items.length > 0);
}

/** Destinos registados mas ainda sem ecrã — alimenta o inventário/documentação. */
export function pendingContextDestinations(registry = CONTEXT_DESTINATIONS) {
  return registry.filter((entry) => entry.status !== "implemented").map((entry) => entry.id);
}
