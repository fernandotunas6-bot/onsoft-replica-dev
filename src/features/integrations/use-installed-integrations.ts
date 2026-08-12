import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isIntegrationActive } from "./launcher";
import { listInstalledCapabilities } from "./server";

export function useInstalledIntegrations() {
  const query = useQuery({
    queryKey: ["school", "integrations", "installed"],
    queryFn: async () => {
      try {
        return await listInstalledCapabilities();
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 30_000,
  });

  const granted = useMemo(() => {
    const ids = new Set<string>();
    for (const item of query.data ?? []) {
      if (!isIntegrationActive(item.status)) continue;
      for (const capability of item.grantedCapabilities) ids.add(capability);
    }
    return ids;
  }, [query.data]);

  const statusByProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of query.data ?? []) map.set(item.id, item.status);
    return map;
  }, [query.data]);

  return {
    isLoading: query.isLoading,
    granted,
    statusByProvider,
    hasCapability: (id: string) => granted.has(id),
    isInstalled: (provider: string) => isIntegrationActive(statusByProvider.get(provider)),
  };
}
