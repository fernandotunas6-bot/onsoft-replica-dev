import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyNotifications, markMyNotificationsRead } from "./personal";
import { cn } from "@/lib/utils";

export const PERSONAL_NOTIFICATIONS_KEY = ["notifications", "personal"];

export function usePersonalNotifications() {
  return useQuery({
    queryKey: PERSONAL_NOTIFICATIONS_KEY,
    queryFn: () => listMyNotifications(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return new Date(iso).toLocaleDateString("pt-PT");
}

/** Lista no painel do sino; ao abrir, as não lidas passam a lidas. */
export function PersonalNotificationsList({ open }: { open: boolean }) {
  const queryClient = useQueryClient();
  const query = usePersonalNotifications();
  const items = query.data?.items ?? [];
  const unreadIds = items.filter((item) => !item.read).map((item) => item.id);
  const markRead = useMutation({
    mutationFn: (ids: string[]) => markMyNotificationsRead({ data: { ids } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PERSONAL_NOTIFICATIONS_KEY }),
  });
  const unreadKey = unreadIds.join(",");
  useEffect(() => {
    if (!open || !unreadKey) return;
    // Espera um pouco: quem abre o painel chega a ver quais eram novas.
    const timer = window.setTimeout(() => markRead.mutate(unreadKey.split(",")), 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unreadKey]);

  if (!items.length) return null;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border">
      {items.map((item) => (
        <li key={item.id} className={cn("px-3 py-2.5", !item.read && "bg-primary-soft/30")}>
          <p className="flex items-start justify-between gap-2 text-sm">
            <span className={cn(!item.read && "font-medium")}>{item.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {relativeTime(item.createdAt)}
            </span>
          </p>
          <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground line-clamp-4">
            {item.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
