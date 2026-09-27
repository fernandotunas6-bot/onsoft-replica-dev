import { MutationCache, QueryCache, QueryClient, keepPreviousData } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { attachPerformanceSupervisor } from "@/lib/performance-supervisor";
import { RouteErrorScreen } from "@/components/error/RouteErrorScreen";
import { isSessionError, reportPossibleSessionError } from "@/lib/session-expiry";

export const getRouter = () => {
  const queryClient = new QueryClient({
    // Sessão expirada em qualquer pedido → volta ao ecrã de entrada em vez de ecrã em branco.
    queryCache: new QueryCache({ onError: (error) => void reportPossibleSessionError(error) }),
    mutationCache: new MutationCache({
      onError: (error) => void reportPossibleSessionError(error),
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
    defaultErrorComponent: ({ error, reset }) => <RouteErrorScreen error={error} reset={reset} />,
  });

  return router;
};
