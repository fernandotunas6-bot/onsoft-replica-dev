import type { ElementType } from "react";
import {
  canAccessPath,
  canReadModule,
  type accessModules,
  type ApplicationRole,
  type ModuleGrantMap,
} from "@/features/auth/access-policy";
import type { Plan } from "@/features/saas/types";
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
  /** Caminho concreto quando a rota tem parâmetros (`/alunos/<id>`); por omissão, `to`. */
  path?: (trail: ContextFrame[]) => string;
  search?: (trail: ContextFrame[]) => ContextSearch;
  module: AccessModuleKey;
  order: number;
  /**
   * Só estes cargos vêem a entrada. Estreita o catálogo, nunca o alarga: a
   * rota continua a precisar de `canAccessPath` e `canReadModule`.
   */
  roles?: readonly ApplicationRole[];
  /**
   * Regra do conteúdo, quando a leitura do módulo não chega (o financeiro do
   * aluno segue o servidor, que o deixa à Secretaria). Também só estreita.
   */
  allow?: (role: string, grants: ModuleGrantMap) => boolean;
  /**
   * Disponibilidade pelo caminho: uma entrada que abre uma relação (o professor
   * da disciplina) só aparece quando o servidor a devolveu.
   */
  available?: (trail: ContextFrame[]) => boolean;
}

export type ContextLink = { to: string; search: ContextSearch };

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
        (!entry.roles || (entry.roles as readonly string[]).includes(context.role)) &&
        (!entry.allow || entry.allow(context.role, context.grants)) &&
        (!entry.available || entry.available(context.trail)) &&
        canAccessPath(entry.to, context.role, context.grants, plan) &&
        canReadModule(context.role, entry.module, context.grants),
    )
    .sort((a, b) => a.order - b.order);
}

export function contextEntryLink(entry: ContextNavEntry, context: ResolvedContext): ContextLink {
  return {
    to: entry.path?.(context.trail) ?? entry.to,
    search: entry.search?.(context.trail) ?? {},
  };
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
    const link = contextEntryLink(entry, context);
    if (link.to !== pathname) continue;
    const fixed = Object.entries(link.search).filter(([, value]) => value !== undefined);
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
