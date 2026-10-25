import type { ElementType } from "react";
import { canAccessPath, canReadModule, type accessModules } from "@/features/auth/access-policy";
import type { Plan } from "@/features/saas/types";
import { contextKey } from "./context-resolver";
import type { ContextFrame, EntityType, ResolvedContext } from "./types";

/**
 * SIGA Context Engine — registo das entradas da sidebar por contexto.
 *
 * Cada entrada aponta para uma rota que já existe e só aparece quando o
 * catálogo autorizado (papel, permissões e plano) deixa abrir essa rota. O
 * registo não cria destinos nem substitui a protecção das rotas ou do servidor.
 */

type AccessModuleKey = (typeof accessModules)[number]["key"];

export type ContextSearch = Record<string, string | undefined>;

export interface ContextNavEntry {
  /** Estável: serve de activeView e de chave de memória. */
  id: string;
  label: string;
  icon: ElementType;
  group: string;
  /** O tipo da entidade mais específica do caminho em que a entrada aparece. */
  contexts: EntityType[];
  /** Rota existente no catálogo de navegação. */
  to: string;
  search?: (trail: ContextFrame[]) => ContextSearch;
  module: AccessModuleKey;
  order: number;
}

export type ContextLink = { to: string; search: ContextSearch };

/** Nome do tipo de entidade no cabeçalho da sidebar («Disciplina · Matemática»). */
export const CONTEXT_TYPE_LABELS: Record<EntityType, string> = {
  student: "Aluno",
  teacher: "Professor",
  class: "Turma",
  "subject-offering": "Disciplina",
  "finance-overview": "Financeiro",
  "dashboard-overview": "Painel",
};

/** Um passo do caminho com as suas entradas e o contexto truncado nesse passo. */
export type ContextLevel = {
  frame: ContextFrame;
  context: ResolvedContext;
  entries: ContextNavEntry[];
};

export function innermostFrame(context: Pick<ResolvedContext, "trail">): ContextFrame | null {
  return context.trail.at(-1) ?? null;
}

/** Entradas do contexto activo que o utilizador pode abrir, pela ordem declarada. */
export function getContextEntries(
  context: ResolvedContext,
  entries: readonly ContextNavEntry[],
  plan?: Plan | null,
): ContextNavEntry[] {
  const inner = innermostFrame(context);
  if (!inner) return [];
  return entries
    .filter(
      (entry) =>
        entry.contexts.includes(inner.type) &&
        canAccessPath(entry.to, context.role, context.grants, plan) &&
        canReadModule(context.role, entry.module, context.grants),
    )
    .sort((a, b) => a.order - b.order);
}

/**
 * Um nível por passo do caminho que tem entradas autorizadas, do mais geral
 * para o mais específico: Turma A, depois Matemática. O último é o actual; os
 * anteriores são o regresso ao nível superior.
 */
export function getContextLevels(
  context: ResolvedContext,
  entries: readonly ContextNavEntry[],
  plan?: Plan | null,
): ContextLevel[] {
  return context.trail.flatMap((frame, index) => {
    const trail = context.trail.slice(0, index + 1);
    const level: ResolvedContext =
      trail.length === context.trail.length
        ? context
        : {
            ...context,
            trail,
            activeView: null,
            key: contextKey(context.schoolId, context.role, context.academicYearId, trail),
          };
    const levelEntries = getContextEntries(level, entries, plan);
    return levelEntries.length > 0 ? [{ frame, context: level, entries: levelEntries }] : [];
  });
}

export function contextEntryLink(entry: ContextNavEntry, context: ResolvedContext): ContextLink {
  return { to: entry.to, search: entry.search?.(context.trail) ?? {} };
}

/**
 * A entrada que corresponde à localização actual: mesmo caminho e todos os
 * parâmetros que fixa iguais. Ganha a mais específica, para que duas entradas
 * da mesma rota não fiquem activas ao mesmo tempo.
 */
export function findActiveContextEntry(
  entries: readonly ContextNavEntry[],
  context: ResolvedContext,
  pathname: string,
  search: Record<string, unknown>,
): string | null {
  let best: { id: string; specificity: number } | null = null;
  for (const entry of entries) {
    if (entry.to !== pathname) continue;
    const fixed = Object.entries(contextEntryLink(entry, context).search).filter(
      ([, value]) => value !== undefined,
    );
    if (!fixed.every(([key, value]) => search[key] === value)) continue;
    if (!best || fixed.length > best.specificity) {
      best = { id: entry.id, specificity: fixed.length };
    }
  }
  return best?.id ?? null;
}

/** O contexto com a entrada activa preenchida. */
export function withActiveView(
  context: ResolvedContext,
  entries: readonly ContextNavEntry[],
  pathname: string,
  search: Record<string, unknown>,
): ResolvedContext {
  const activeView = findActiveContextEntry(entries, context, pathname, search);
  return activeView === context.activeView ? context : { ...context, activeView };
}

/** Rótulos do breadcrumb: a área (quando há) e cada passo do caminho. */
export function contextBreadcrumb(context: ResolvedContext, area?: string | null): string[] {
  return [...(area ? [area] : []), ...context.trail.map((frame) => frame.label)];
}
