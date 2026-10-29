import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyNotifications, markMyNotificationsRead, type PersonalNotification } from "./personal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Feed = { items: PersonalNotification[]; unread: number };
export const PERSONAL_NOTIFICATIONS_KEY = ["notifications", "personal"];
export const personalNotificationsKey = (userId: string, schoolId: string) =>
  [...PERSONAL_NOTIFICATIONS_KEY, userId, schoolId] as const;

/** Um centro partilhado entre o sino e a lista, separado por conta e escola. */
export function usePersonalNotifications(userId: string, schoolId: string) {
  const queryClient = useQueryClient();
  const queryKey = personalNotificationsKey(userId, schoolId);

  useEffect(() => {
    if (!userId || !schoolId) return;
    const channel = supabase
      .channel("personal_notifications_" + userId + "_" + crypto.randomUUID())
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "user_id=eq." + userId,
        },
        () => void queryClient.invalidateQueries({ queryKey: personalNotificationsKey(userId, schoolId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, schoolId, queryClient]);

  return useQuery({
    queryKey,
    enabled: Boolean(userId && schoolId),
    queryFn: () => listMyNotifications(),
    staleTime: 15_000,
    // Reserva quando a publicação Realtime ainda não foi aplicada.
    refetchInterval: 60_000,
    retry: false,
  });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return "há " + minutes + " min";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return "há " + hours + " h";
  return new Date(iso).toLocaleDateString("pt-PT");
}

type PersonalNotificationsListProps = {
  open: boolean;
  onClose?: () => void;
  userId: string;
  schoolId: string;
  query: ReturnType<typeof usePersonalNotifications>;
};

/** Abrir o sino não marca nada: só clicar num aviso ou «Marcar tudo» altera o estado. */
export function PersonalNotificationsList({
  open,
  onClose,
  userId,
  schoolId,
  query,
}: PersonalNotificationsListProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"unread" | "all">("unread");
  const queryKey = personalNotificationsKey(userId, schoolId);
  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  useEffect(() => {
    if (open && userId && schoolId) void query.refetch();
    // Só ao abrir ou trocar de conta/escola, nunca em cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, schoolId]);

  const markRead = useMutation({
    mutationFn: (ids: string[] | undefined) =>
      markMyNotificationsRead({ data: ids ? { ids } : {} }),
    meta: { errorToast: false },
    onMutate: (ids) => {
      queryClient.setQueryData<Feed>(queryKey, (old) => {
        if (!old) return old;
        const selected = ids ? new Set(ids) : null;
        let changed = 0;
        const updated = old.items.map((item) => {
          if (item.read || (selected && !selected.has(item.id))) return item;
          changed += 1;
          return { ...item, read: true };
        });
        return {
          items: updated,
          unread: selected ? Math.max(0, old.unread - changed) : 0,
        };
      });
    },
    onError: () => {
      // A cache é reconciliada com o servidor; não se apaga o aviso.
      toast.error("Não foi possível marcar como lida. Tente novamente.");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const markOne = (item: PersonalNotification) => {
    if (!item.read) markRead.mutate([item.id]);
  };
  const visible = filter === "unread" ? items.filter((item) => !item.read) : items;

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">A carregar notificações…</p>;
  }
  if (query.isError) {
    return (
      <div role="alert" className="space-y-2 text-sm text-muted-foreground">
        <p>Não foi possível carregar as notificações.</p>
        <button type="button" className="font-medium text-primary underline" onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Notificações pessoais" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          <button
            type="button"
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
            className={cn("rounded-md px-2.5 py-1.5", filter === "unread" ? "bg-secondary font-semibold" : "text-muted-foreground")}
          >
            Por ler ({unread})
          </button>
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
            className={cn("rounded-md px-2.5 py-1.5", filter === "all" ? "bg-secondary font-semibold" : "text-muted-foreground")}
          >
            Todas
          </button>
        </div>
        {unread > 0 ? (
          <button
            type="button"
            disabled={markRead.isPending}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            onClick={() => markRead.mutate(undefined)}
          >
            Marcar tudo como lido
          </button>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-border bg-secondary/30 px-3 py-4 text-sm text-muted-foreground">
          {filter === "unread" ? "Não há notificações por ler." : "Ainda não há notificações no histórico."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visible.map((item) => {
            const className = cn(
              "block w-full px-3 py-3 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              !item.read && "bg-primary-soft/30",
            );
            const body = (
              <>
                <span className="flex items-start justify-between gap-2">
                  <span className={cn("text-sm", !item.read && "font-semibold")}>{item.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
                </span>
                <span className="mt-1 block whitespace-pre-line text-xs text-muted-foreground line-clamp-4">{item.body}</span>
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link to={item.href as never} className={className} onClick={() => { markOne(item); onClose?.(); }}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" className={className} onClick={() => markOne(item)}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
