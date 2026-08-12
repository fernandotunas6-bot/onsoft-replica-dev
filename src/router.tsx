import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { attachPerformanceSupervisor } from "@/lib/performance-supervisor";
import { RouteErrorScreen } from "@/components/error/RouteErrorScreen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
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
