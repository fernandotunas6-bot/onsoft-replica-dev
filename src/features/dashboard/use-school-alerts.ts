import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listSchoolAlerts } from "@/features/dashboard/server";

export function useSchoolAlerts() {
  const currentUser = useCurrentAccount();
  const query = useQuery({
    queryKey: ["dashboard", "alerts", currentUser.id],
    enabled: Boolean(currentUser.id),
    queryFn: () => listSchoolAlerts(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const alerts = query.data ?? [];
  return { alerts, alertCount: alerts.length, alertsQuery: query };
}
