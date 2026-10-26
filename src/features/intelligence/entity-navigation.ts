import { contextKindLabel } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import type { EntityType, ResolvedContext } from "./types";

/**
 * SIGA Context Engine — o menu da entidade aberta, partilhado pela sidebar do
 * computador e pelo hub «Mais» do telemóvel: as mesmas entradas, a mesma
 * entrada activa e o mesmo «Voltar».
 */
export type EntityNavigation = {
  context: ResolvedContext;
  entries: ContextNavEntry[];
  activeId: string | null;
  back: { to: string; search?: Record<string, string | undefined> };
};

/** «Turma», «Disciplina», «Aluno»… para o cabeçalho do menu (declarado por cada módulo). */
export function entityKindLabel(type: EntityType): string {
  return contextKindLabel(type);
}

/** As entradas por grupo («Ensino», «Ficha do aluno»…), pela ordem em que chegam. */
export function groupContextEntries(
  entries: readonly ContextNavEntry[],
): Array<{ title: string; items: ContextNavEntry[] }> {
  const groups: Array<{ title: string; items: ContextNavEntry[] }> = [];
  for (const entry of entries) {
    const group = groups.find((item) => item.title === entry.group);
    if (group) group.items.push(entry);
    else groups.push({ title: entry.group, items: [entry] });
  }
  return groups;
}
