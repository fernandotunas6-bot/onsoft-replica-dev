import type { NavGroup } from "./portal-engine";

/**
 * Vocabulário do Ensino Superior: numa instituição só de Superior fala-se de
 * «estudantes», não de «alunos». Só muda o texto mostrado; rotas e permissões
 * ficam iguais.
 */
export function higherEdLabel(label: string) {
  return label
    .replace(/\bAlunos\b/g, "Estudantes")
    .replace(/\balunos\b/g, "estudantes")
    .replace(/\bAluno\b/g, "Estudante")
    .replace(/\baluno\b/g, "estudante");
}

export function withHigherEdVocabulary(groups: NavGroup[]): NavGroup[] {
  return groups.map((group) => ({
    title: higherEdLabel(group.title),
    items: group.items.map((item) => ({
      ...item,
      label: higherEdLabel(item.label),
      ...(item.children
        ? {
            children: item.children.map((child) => ({
              ...child,
              label: higherEdLabel(child.label),
            })),
          }
        : {}),
    })),
  }));
}
