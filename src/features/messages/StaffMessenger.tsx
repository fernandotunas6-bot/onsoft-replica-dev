import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listSchoolColleagues, type SchoolColleague } from "@/features/messages/server";
import {
  initialsFromName,
  matchesColleagueQuery,
  readRecentContactIds,
  RECENT_CONTACT_LIMIT,
  touchRecentContact,
} from "@/features/messages/recent-contacts";
import { useChatUnread } from "@/features/messages/use-chat-unread";

export function useFrequentColleagues() {
  const currentUser = useCurrentAccount();
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const colleaguesQuery = useQuery({
    queryKey: ["messages", "colleagues", currentUser.id],
    enabled: Boolean(currentUser.id),
    queryFn: () => listSchoolColleagues(),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (currentUser.id) setRecentIds(readRecentContactIds(currentUser.id));
  }, [currentUser.id]);

  const colleagues = useMemo(() => colleaguesQuery.data ?? [], [colleaguesQuery.data]);
  const frequent = useMemo(() => {
    const byId = new Map(colleagues.map((row) => [row.id, row]));
    const picked: SchoolColleague[] = [];
    for (const id of recentIds) {
      const row = byId.get(id);
      if (row) picked.push(row);
    }
    for (const row of colleagues) {
      if (picked.length >= RECENT_CONTACT_LIMIT) break;
      if (!picked.some((item) => item.id === row.id)) picked.push(row);
    }
    return picked.slice(0, RECENT_CONTACT_LIMIT);
  }, [colleagues, recentIds]);

  const remember = (peerId: string) => {
    touchRecentContact(currentUser.id, peerId);
    setRecentIds(readRecentContactIds(currentUser.id));
  };

  return { currentUser, colleaguesQuery, colleagues, frequent, remember };
}

function UnreadDot({ label }: { label: string }) {
  return (
    <span
      className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-card"
      aria-label={label}
    />
  );
}

export function ColleagueAvatars({
  onOpenDirectory,
  onOpenThread,
}: {
  onOpenDirectory: () => void;
  onOpenThread: (peer: SchoolColleague) => void;
}) {
  const { frequent, colleaguesQuery, colleagues } = useFrequentColleagues();
  const { unreadPeerIds: unreadIds } = useChatUnread();
  const hiddenUnread = [...unreadIds].some((id) => !frequent.some((person) => person.id === id));

  return (
    <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-1.5">
      {colleaguesQuery.isLoading && !frequent.length ? (
        <p className="text-[11px] text-muted-foreground">A carregar colegas…</p>
      ) : null}
      {frequent.map((person) => (
        <button
          key={person.id}
          type="button"
          title={person.full_name}
          aria-label={`Mensagem para ${person.full_name}`}
          className="relative flex size-8 items-center justify-center overflow-visible rounded-full bg-card/80 text-[11px] font-semibold text-secondary-foreground ring-2 ring-white/70 transition hover:ring-primary/40"
          onClick={() => onOpenThread(person)}
        >
          <UserAvatar
            url={person.avatar_url}
            initials={initialsFromName(person.full_name)}
            className="size-8 bg-primary-soft text-[11px] font-bold text-primary"
          />
          {unreadIds.has(person.id) ? <UnreadDot label="Mensagem por ler" /> : null}
        </button>
      ))}
      <button
        type="button"
        aria-label="Ver todos os utilizadores"
        className="relative flex size-8 items-center justify-center rounded-full border border-dashed border-border bg-card/50 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        onClick={onOpenDirectory}
      >
        +{hiddenUnread ? <UnreadDot label="Há mensagens por ler" /> : null}
      </button>
    </div>
  );
}

export function ColleagueDirectory({
  onBack,
  onOpenThread,
}: {
  onBack: () => void;
  onOpenThread: (peer: SchoolColleague) => void;
}) {
  const { colleagues, colleaguesQuery } = useFrequentColleagues();
  const { unreadPeerIds: unreadIds, lastTextByPeer } = useChatUnread();
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => colleagues.filter((row) => matchesColleagueQuery(row, query)),
    [colleagues, query],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onBack}
          aria-label="Voltar"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <p className="text-sm font-semibold">Nova mensagem</p>
      </div>
      <div className="px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Pesquisar destinatário"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar nome ou cargo…"
            className="pl-9"
            autoFocus
          />
        </div>
      </div>
      <ul className="no-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {colleaguesQuery.isLoading ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">A carregar…</li>
        ) : null}
        {!colleaguesQuery.isLoading && !colleagues.length ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Ainda não há outras contas nesta escola. Convide colegas em Acessos.
          </li>
        ) : null}
        {!colleaguesQuery.isLoading && colleagues.length > 0 && !filtered.length ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum utilizador encontrado.
          </li>
        ) : null}
        {filtered.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-secondary"
              onClick={() => onOpenThread(person)}
            >
              <span className="relative">
                <UserAvatar
                  url={person.avatar_url}
                  initials={initialsFromName(person.full_name)}
                  className="size-9 bg-primary-soft text-xs font-bold text-primary"
                />
                {unreadIds.has(person.id) ? <UnreadDot label="Mensagem por ler" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{person.full_name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {lastTextByPeer.get(person.id) || person.cargo || ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { SchoolColleague };
