import { useMemo, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ActiveContext, type ActiveContextValue } from "@/features/intelligence/active-context";
import { contextCrumbs } from "@/features/intelligence/context-breadcrumb";
import { useEntityNavigation } from "./ContextEntityNav";

const NO_SEARCH: Record<string, unknown> = {};

/**
 * Resolve o contexto da URL para o cabeçalho, o hub «Mais» do telemóvel e o
 * conteúdo, com a mesma regra do menu da entidade na sidebar (as consultas são
 * as mesmas e o React Query faz um só pedido).
 */
export function ActiveContextProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({
    select: (state) => state.location.search as Record<string, unknown> | undefined,
  });
  const navigation = useEntityNavigation(pathname, search ?? NO_SEARCH);
  const value = useMemo<ActiveContextValue>(() => {
    const context = navigation?.context ?? null;
    return {
      context,
      navigation,
      crumbs: contextCrumbs(context?.trail, pathname, search ?? NO_SEARCH),
    };
  }, [navigation, pathname, search]);
  return <ActiveContext.Provider value={value}>{children}</ActiveContext.Provider>;
}
