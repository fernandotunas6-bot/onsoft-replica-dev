import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listChatConversations } from "./chat-server";
import { summarizeChatUnread } from "./chat-unread";

/** Chave partilhada: o sino, o selo do avatar, a coluna do chat e o painel da conta. */
export const CHAT_UNREAD_KEY = ["chat", "unread-summary"] as const;

export function invalidateChatUnread(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
}

/*
 * Uma só ligação de tempo real para todos os que usam o hook (sino, coluna,
 * painel da conta): contagem de referências ao nível do módulo. Cada evento só
 * marca a lista como desactualizada; a leitura junta rajadas de mensagens.
 */
let subscribers = 0;
let channel: ReturnType<typeof supabase.channel> | null = null;
let channelUser: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function subscribe(queryClient: QueryClient, userId: string) {
  subscribers += 1;
  if (channel && channelUser === userId) return;
  if (channel) void supabase.removeChannel(channel);
  const refresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => invalidateChatUnread(queryClient), 400);
  };
  channelUser = userId;
  channel = supabase
    .channel(`chat-unread:${userId}`)
    // A RLS só entrega mensagens das conversas em que a conta participa.
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "siga_chat_messages" },
      refresh,
    )
    // O próprio marcador de leitura (abriu a conversa noutro dispositivo).
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "siga_chat_members",
        filter: `user_id=eq.${userId}`,
      },
      refresh,
    )
    .subscribe();
}

function unsubscribe() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers > 0 || !channel) return;
  void supabase.removeChannel(channel);
  channel = null;
  channelUser = null;
}

/**
 * Mensagens por ler do chat (`siga_chat_*`), a única fonte de «por ler» do
 * SIGA. O marcador de leitura está na base (`last_read_at`), por isso o que se
 * lê no telemóvel deixa de contar no computador.
 */
export function useChatUnread() {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const userId = account.id;

  const query = useQuery({
    queryKey: [...CHAT_UNREAD_KEY, userId],
    enabled: Boolean(userId),
    queryFn: async () => (await listChatConversations()).conversations,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Rede da escola que corta o tempo real: o contador recupera sozinho.
    refetchInterval: 120_000,
    retry: false,
    // O contador é um extra: falhar não interrompe ninguém com um aviso.
    meta: { errorToast: false },
  });

  useEffect(() => {
    if (!userId) return;
    subscribe(queryClient, userId);
    return unsubscribe;
  }, [queryClient, userId]);

  return useMemo(() => summarizeChatUnread(query.data ?? []), [query.data]);
}
