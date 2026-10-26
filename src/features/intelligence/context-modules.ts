import type { ApplicationRole } from "@/features/auth/access-policy";
import { ACADEMIC_CONTEXT_MODULE } from "./academic-context-entries";
import type { ContextNavEntry } from "./context-registry";
import { INVOICE_CONTEXT_MODULE } from "./invoice-context-entries";
import { STUDENT_CONTEXT_MODULE } from "./student-context-entries";
import { TEACHER_CONTEXT_MODULE } from "./teacher-context-entries";
import type { EntityType, ResolvedContext } from "./types";

/**
 * SIGA Context Engine — contribuições dos módulos (§7 e §19 do Prompt Master).
 *
 * Cada módulo declara, no seu próprio ficheiro, as entidades que abre, o nome de
 * cada uma no cabeçalho do menu, as entradas, quem recebe o menu e para onde leva
 * «Voltar». O motor (resolvedor, registo e menu) só lê esta lista: um módulo novo
 * junta aqui a sua contribuição sem mudar o motor.
 */

export type ContextBackLink = { to: string; search?: Record<string, string | undefined> };

export type ContextModule = {
  /** O nome de cada tipo de entidade do módulo no cabeçalho do menu («Turma», «Fatura»…). */
  kinds: Partial<Record<EntityType, string>>;
  entries: readonly ContextNavEntry[];
  /**
   * Quem recebe o menu destas entidades. Só estreita: cada entrada continua a
   * passar por `canAccessPath` e pelo módulo, e o servidor valida cada leitura.
   */
  menuRoles: readonly ApplicationRole[];
  /** «Voltar»: de onde a entidade se abre. Sem resposta, o separador da página actual. */
  back?: (
    context: ResolvedContext,
    pathname: string,
    search: Record<string, unknown>,
  ) => ContextBackLink | null;
};

export const CONTEXT_MODULES: readonly ContextModule[] = [
  ACADEMIC_CONTEXT_MODULE,
  STUDENT_CONTEXT_MODULE,
  TEACHER_CONTEXT_MODULE,
  INVOICE_CONTEXT_MODULE,
];

/** As entradas de todos os módulos; o registo escolhe pelo tipo da entidade aberta. */
export const CONTEXT_ENTRIES: readonly ContextNavEntry[] = CONTEXT_MODULES.flatMap(
  (module) => module.entries,
);

export function contextModuleFor(type: EntityType): ContextModule | undefined {
  return CONTEXT_MODULES.find((module) => type in module.kinds);
}

/** O nome do tipo no cabeçalho do menu; um tipo sem módulo é «Contexto». */
export function contextKindLabel(type: EntityType): string {
  return contextModuleFor(type)?.kinds[type] ?? "Contexto";
}

/** Se a conta recebe o menu desta entidade (um tipo sem módulo não tem menu). */
export function canOpenEntityMenu(type: EntityType, role: string): boolean {
  return (
    (contextModuleFor(type)?.menuRoles as readonly string[] | undefined)?.includes(role) ?? false
  );
}

/** «Voltar» do módulo da entidade mais interior, ou o separador da página actual. */
export function contextBackLink(
  context: ResolvedContext,
  pathname: string,
  search: Record<string, unknown>,
): ContextBackLink {
  const inner = context.trail.at(-1);
  const declared = inner ? contextModuleFor(inner.type)?.back?.(context, pathname, search) : null;
  if (declared) return declared;
  const tab = typeof search.tab === "string" ? search.tab : undefined;
  return { to: pathname, ...(tab ? { search: { tab } } : {}) };
}
