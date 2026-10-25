import { createContext, useContext } from "react";
import type { ContextCrumb, ContextCrumbs } from "./context-breadcrumb";
import type { ResolvedContext } from "./types";

export type ActiveContextValue = {
  /** O contexto da URL confirmado pelo servidor (o do menu da entidade). */
  context: ResolvedContext | null;
  crumbs: ContextCrumbs;
};

export const ActiveContext = createContext<ActiveContextValue | null>(null);

/**
 * O contexto da página, resolvido pela AppShell para o cabeçalho e o conteúdo.
 * Fora da AppShell (páginas públicas, testes de um componente) é null e o
 * cabeçalho fica como sempre foi.
 */
export function useActiveContext(): ActiveContextValue | null {
  return useContext(ActiveContext);
}

const sameLabel = (a: string, b: string) =>
  a.trim().localeCompare(b.trim(), "pt", { sensitivity: "accent" }) === 0;

/**
 * Os passos a mostrar depois do título. Na página da própria entidade (o
 * título já é «Maria Domingos») o último passo repetiria o título, e sai.
 */
export function crumbsAfterTitle(crumbs: ContextCrumbs, title: string): ContextCrumb[] {
  const frames = [...crumbs.frames];
  let last = frames.at(-1);
  while (last && sameLabel(last.label, title)) {
    frames.pop();
    last = frames.at(-1);
  }
  return frames;
}
