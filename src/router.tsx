import { MutationCache, QueryCache, QueryClient, keepPreviousData } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { attachPerformanceSupervisor } from "@/lib/performance-supervisor";
import { RouteErrorScreen } from "@/components/error/RouteErrorScreen";
import { isSessionError, reportPossibleSessionError } from "@/lib/session-expiry";
import { reportPossibleStepUp } from "@/lib/step-up";
import { toastActionError } from "@/lib/action-error-toast";
import { errorParts, guidanceFor } from "@/lib/error-guidance";
import { toast } from "@/lib/toast";

/**
 * `meta.errorToast: false` numa query ou mutação cala o aviso global (ex.:
 * marcar notificações como lidas em segundo plano).
 */
type ErrorToastMeta = { errorToast?: boolean } | undefined;

export const getRouter = () => {
  const queryClient = new QueryClient({
    // Sessão expirada em qualquer pedido → volta ao ecrã de entrada em vez de ecrã em branco.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (reportPossibleSessionError(error)) return;
        // Uma leitura que falha por falta de configuração (sem ano lectivo,
        // sem plano de propinas…) diz onde se configura. As outras falhas de
        // leitura ficam no próprio ecrã, que já mostra o estado de erro.
        if ((query.meta as ErrorToastMeta)?.errorToast === false) return;
        const guidance = guidanceFor(error);
        if (guidance?.kind === "config") toast.error(errorParts(error).message || guidance.fix);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        // Acção crítica sem confirmação recente → abre «Confirme que é você».
        if (reportPossibleStepUp(error) || reportPossibleSessionError(error)) return;
        // Mutação sem `onError` próprio: nenhuma falha fica calada.
        if (mutation.options.onError) return;
        if ((mutation.meta as ErrorToastMeta)?.errorToast === false) return;
        toastActionError(error, "Não foi possível concluir a operação.");
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => !isSessionError(error) && failureCount < 1,
        placeholderData: keepPreviousData,
      },
    },
  });

  attachPerformanceSupervisor(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 60_000,
    defaultErrorComponent: ({ error, reset }) => (
      <RouteErrorScreen error={error as Error} reset={reset} />
    ),
  });

  return router;
};
