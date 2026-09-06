import { useCallback, useId, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listInboxPreviews, type SchoolColleague } from "@/features/messages/server";
import { readLocalThread } from "@/features/messages/local-thread";
import { readRecentContactIds } from "@/features/messages/recent-contacts";
import type { InboxPreview } from "@/features/messages/schemas";
import { hasUnreadIncoming, markThreadRead, readLastReadMap } from "@/features/messages/unread";

function lastLocalActivity(userId: string, peerId: string) {
  const thread = readLocalThread(userId, peerId);
  return thread.at(-1) ?? null;
}

function lastLocalIncoming(userId: string, peerId: string) {
  const incoming = readLocalThread(userId, peerId).filter((item) => !item.mine);
  return incoming.at(-1) ?? null;
}
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useInboxUnread(colleagues: SchoolColleague[] = []) {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const instanceId = useId();
  const inboxQuery = useQuery({
    queryKey: ["messages", "inbox", currentUser.id],
    enabled: Boolean(currentUser.id),
    queryFn: () => listInboxPreviews(),
    retry: false,
  });

  useEffect(() => {
    if (!currentUser.id) return;
    const channel = supabase
      .channel(`inbox_${currentUser.id}_${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "siga_direct_messages",
          filter: `recipient_id=eq.${currentUser.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["messages", "inbox", currentUser.id],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, instanceId, queryClient]);
  const readTick = useQuery({
    queryKey: ["messages", "read-tick", currentUser.id],
    enabled: Boolean(currentUser.id),
    queryFn: () => Date.now(),
    staleTime: Infinity,
    initialData: 0,
  });

  const lastRead = useMemo(() => readLastReadMap(currentUser.id), [currentUser.id, readTick.data]);

  const previews = useMemo(() => {
    const remote = new Map(
      (inboxQuery.data?.previews ?? []).map((row) => [row.peerId, row] as const),
    );
    const names = new Map(colleagues.map((row) => [row.id, row]));
    const peerIds = new Set([
      ...remote.keys(),
      ...readRecentContactIds(currentUser.id),
      ...Object.keys(lastRead),
      ...colleagues.map((row) => row.id),
    ]);

    const merged: InboxPreview[] = [];
    for (const peerId of peerIds) {
      if (!peerId || peerId === currentUser.id) continue;
      const fromSga = remote.get(peerId);
      const localActivity = lastLocalActivity(currentUser.id, peerId);
      const localIncoming = lastLocalIncoming(currentUser.id, peerId);
      const person = names.get(peerId);

      let lastActivityAt = fromSga?.lastActivityAt ?? null;
      let lastBody = fromSga?.lastBody ?? "";
      if (
        localActivity &&
        (!lastActivityAt || Date.parse(localActivity.createdAt) > Date.parse(lastActivityAt))
      ) {
        lastActivityAt = localActivity.createdAt;
        lastBody =
          localActivity.body ||
          (localActivity.attachmentFileName ? `📎 ${localActivity.attachmentFileName}` : "");
      }
      if (!lastActivityAt) continue;

      let lastIncomingAt = fromSga?.lastIncomingAt ?? null;
      if (
        localIncoming &&
        (!lastIncomingAt || Date.parse(localIncoming.createdAt) > Date.parse(lastIncomingAt))
      ) {
        lastIncomingAt = localIncoming.createdAt;
      }

      merged.push({
        peerId,
        full_name: person?.full_name || fromSga?.full_name || "Colega",
        avatar_url: person?.avatar_url ?? fromSga?.avatar_url ?? null,
        lastActivityAt,
        lastBody,
        lastIncomingAt,
      });
    }
    return merged.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  }, [colleagues, currentUser.id, inboxQuery.data?.previews, lastRead]);

  const unread = useMemo(
    () => previews.filter((row) => hasUnreadIncoming(row.lastIncomingAt, lastRead[row.peerId])),
    [lastRead, previews],
  );
  const unreadIds = useMemo(() => new Set(unread.map((row) => row.peerId)), [unread]);

  const markRead = useCallback(
    (peerId: string, at?: string) => {
      markThreadRead(currentUser.id, peerId, at);
      queryClient.setQueryData(["messages", "read-tick", currentUser.id], Date.now());
    },
    [currentUser.id, queryClient],
  );

  return {
    inboxQuery,
    previews,
    unread,
    unreadIds,
    unreadCount: unread.length,
    markRead,
  };
}
