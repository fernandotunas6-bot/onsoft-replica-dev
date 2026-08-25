import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Paperclip, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaFrame } from "@/components/ui/media-frame";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { signSchoolFile } from "@/features/arquivos/server";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";
import {
  listDirectThread,
  listSchoolColleagues,
  sendDirectMessage,
  type SchoolColleague,
} from "@/features/messages/server";
import {
  initialsFromName,
  matchesColleagueQuery,
  readRecentContactIds,
  RECENT_CONTACT_LIMIT,
  touchRecentContact,
} from "@/features/messages/recent-contacts";
import { appendLocalThread, readLocalThread } from "@/features/messages/local-thread";
import { useInboxUnread } from "@/features/messages/use-inbox-unread";

type MessengerView = "menu" | "directory" | "thread";

function formatMessageTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" });
}

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

  const colleagues = colleaguesQuery.data ?? [];
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
  const { unreadIds } = useInboxUnread(colleagues);
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
  const { unreadIds, previews } = useInboxUnread(colleagues);
  const previewById = useMemo(() => new Map(previews.map((row) => [row.peerId, row])), [previews]);
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
                  {previewById.get(person.id)?.lastBody || person.cargo || ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function openAttachment(fileId: string) {
  signSchoolFile({ data: { id: fileId } })
    .then((signed) => {
      if (signed.url) window.open(signed.url, "_blank", "noopener");
      else toast.error("Não foi possível abrir o arquivo.");
    })
    .catch((error) => {
      toast.error("Não foi possível abrir o arquivo", {
        description: error instanceof Error ? error.message : undefined,
      });
    });
}

function MessageAttachment({ fileId, fileName }: { fileId: string; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(fileName);

  useEffect(() => {
    if (isImage) {
      void signSchoolFile({ data: { id: fileId } })
        .then((signed) => {
          if (signed.url) setUrl(signed.url);
        })
        .catch(() => undefined);
    }
  }, [fileId, isImage]);

  return (
    <div className="mt-1.5 space-y-1">
      {isImage && url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-lg max-w-[220px]"
          onClick={(e) => e.stopPropagation()}
        >
          <MediaFrame
            src={url}
            alt={fileName}
            className="h-32 w-full object-cover transition-transform hover:scale-105"
          />
        </a>
      ) : (
        <button
          type="button"
          onClick={() => openAttachment(fileId)}
          className="flex w-full items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-left text-xs font-medium hover:bg-secondary transition-colors"
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{fileName}</span>
        </button>
      )}
    </div>
  );
}

export function ColleagueThread({ peer, onBack }: { peer: SchoolColleague; onBack: () => void }) {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<{ id: string; name: string } | null>(null);
  const [localMessages, setLocalMessages] = useState(() =>
    readLocalThread(currentUser.id, peer.id),
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadQuery = useQuery({
    queryKey: ["messages", "thread", currentUser.id, peer.id],
    enabled: Boolean(currentUser.id && peer.id),
    queryFn: () => listDirectThread({ data: { peerId: peer.id } }),
    retry: false,
    refetchInterval: 8_000,
  });

  const remote = threadQuery.data?.messages ?? [];
  const useLocal = threadQuery.data?.storage === "local" || Boolean(threadQuery.error);
  const messages = useLocal ? localMessages : remote;

  const { markRead } = useInboxUnread();
  const lastIncomingAt = messages.filter((item) => !item.mine).at(-1)?.createdAt ?? null;

  useEffect(() => {
    if (lastIncomingAt) markRead(peer.id, lastIncomingAt);
  }, [lastIncomingAt, markRead, peer.id]);

  const [sending, setSending] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, peer.id]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body && !attachment) return;
    setSending(true);
    setDraft("");
    setAttachment(null);
    try {
      const result = await sendDirectMessage({
        data: {
          peerId: peer.id,
          body: body || undefined,
          attachmentFileId: attachment?.id,
          attachmentFileName: attachment?.name,
        },
      });
      if (result.storage === "local") {
        setLocalMessages(appendLocalThread(currentUser.id, peer.id, result.message));
      } else {
        await queryClient.invalidateQueries({
          queryKey: ["messages", "thread", currentUser.id, peer.id],
        });
        await queryClient.invalidateQueries({
          queryKey: ["messages", "inbox", currentUser.id],
        });
      }
    } catch (error) {
      const fallback = {
        id: crypto.randomUUID(),
        senderId: currentUser.id,
        body,
        createdAt: new Date().toISOString(),
        mine: true,
        attachmentFileId: attachment?.id ?? null,
        attachmentFileName: attachment?.name ?? null,
      };
      setLocalMessages(appendLocalThread(currentUser.id, peer.id, fallback));
      toast.message("Mensagem guardada neste dispositivo", {
        description:
          error instanceof Error
            ? error.message
            : "Aplique APPLY_ENROLLMENT_AND_PREMIUM.sql para sincronizar no SGA.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
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
        <UserAvatar
          url={peer.avatar_url}
          initials={initialsFromName(peer.full_name)}
          className="size-8 bg-primary-soft text-[11px] font-bold text-primary"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold md:text-sm">{peer.full_name}</p>
          {peer.cargo ? (
            <p className="truncate text-[11px] text-muted-foreground">{peer.cargo}</p>
          ) : null}
        </div>
      </div>
      {useLocal ? (
        <p className="border-b border-border bg-secondary/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          Conversa neste dispositivo. Aplique APPLY_ENROLLMENT_AND_PREMIUM.sql para sincronizar.
        </p>
      ) : null}
      <div className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {!messages.length ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Ainda não há mensagens. Escreva a primeira.
          </p>
        ) : null}
        {messages.map((item) => (
          <div key={item.id} className={`flex ${item.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs md:text-sm ${
                item.mine
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {item.body ? <p>{item.body}</p> : null}
              {item.attachmentFileId && item.attachmentFileName ? (
                <MessageAttachment
                  fileId={item.attachmentFileId}
                  fileName={item.attachmentFileName}
                />
              ) : null}
              {item.createdAt ? (
                <p
                  className={`mt-1 text-[10px] ${
                    item.mine ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {formatMessageTime(item.createdAt)}
                </p>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="border-t border-border px-3 py-2.5" onSubmit={send}>
        {attachment ? (
          <span className="mb-2 flex w-fit items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-xs">
            <FileText className="size-3.5" />
            <span className="max-w-[220px] truncate">{attachment.name}</span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remover anexo"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <PickFileButton
            variant="ghost"
            size="sm"
            onPick={(picked: SchoolFileRecord) =>
              setAttachment({ id: picked.id, name: picked.name })
            }
          >
            <Paperclip className="size-4" />
          </PickFileButton>
          <Input
            aria-label="Mensagem"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escrever mensagem…"
            maxLength={2000}
            className="h-9 text-xs md:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0"
            loading={sending}
            disabled={!draft.trim() && !attachment}
            aria-label="Enviar mensagem"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

export type { MessengerView, SchoolColleague };
