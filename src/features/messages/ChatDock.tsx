import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ClipboardList,
  Clock,
  CornerUpLeft,
  FileText,
  GraduationCap,
  Plus,
  Search,
  Send,
  Smile,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { toast } from "@/lib/toast";
import { toastActionError } from "@/lib/action-error-toast";
import { guidanceFor } from "@/lib/error-guidance";
import { errorMessage } from "@/lib/error-message";
import { isTauriDesktop, openExternalLink } from "@/lib/desktop-utils";
import { reportPossibleSessionError } from "@/lib/session-expiry";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";
import { UserAvatar } from "@/components/ui/user-avatar";
import { touchRecentContact } from "./recent-contacts";
import { isMessagingStaff } from "./messaging-roles";
import { createSigaChatAdapter } from "./chat-adapter";
import { openChatAttachment } from "./chat-server";
import { canAccessPath } from "@/features/auth/access-policy";
import type { ChatContact, ChatConversation, ChatMessage } from "./chat-schemas";

/* Paleta e ícones do template original (chat/ChatEscolar.jsx), mantidos tal e
   qual a pedido: o painel tem a sua própria identidade dentro do SIGA. */
const T = {
  brand: "#0f7a5c",
  brandDark: "#0a5c45",
  out: "#d9f2e4",
  wall: "#ebe8e0",
  panel: "#f6f5f1",
  group: "#c9dfd3",
  ink: "#1d2521",
  mute: "#66736c",
  line: "#e0ddd4",
  read: "#2b8fd9",
  badge: "#1fae7a",
};
const TINTS = ["#cfe8dc", "#f3dcc8", "#dbd6f3", "#f3d4dc", "#d3e4f3"];
const QUICK = [
  "Lembrete: reunião de encarregados na sexta, às 17h.",
  "O seu educando faltou hoje. Está tudo bem?",
  "O trabalho de casa está pendente. Pode reenviar até amanhã?",
  "A pauta do trimestre já está disponível no sistema.",
];
const EMOJIS = [
  "😀",
  "😊",
  "👍",
  "🙏",
  "👏",
  "❤️",
  "😢",
  "🎉",
  "📚",
  "✏️",
  "🎒",
  "🏫",
  "📅",
  "✅",
  "⚠️",
  "🙌",
];
const FILTERS = [
  ["all", "Todas"],
  ["unread", "Não lidas"],
  ["group", "Turmas"],
  ["guardian", "Encarregados"],
] as const;

const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (t: number) => `${pad(new Date(t).getHours())}:${pad(new Date(t).getMinutes())}`;
const dayKey = (t: number) => new Date(t).toDateString();
const dayLabel = (t: number) =>
  dayKey(t) === dayKey(Date.now())
    ? "Hoje"
    : dayKey(t) === dayKey(Date.now() - DAY)
      ? "Ontem"
      : new Date(t).toLocaleDateString("pt-AO");
const listTime = (t: number) => (dayLabel(t) === "Hoje" ? hm(t) : dayLabel(t));
const uid = () => Math.random().toString(36).slice(2, 9);
const initials = (n: string) =>
  n
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
const tint = (n: string) => TINTS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const fsize = (b: number) =>
  b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;

function Ticks({ s }: { s: ChatMessage["status"] }) {
  if (s === "sending") return <Clock size={12} color={T.mute} />;
  // Um «!» sozinho passava despercebido: diz-se o que aconteceu e o que fazer.
  if (s === "failed")
    return (
      <b style={{ color: "#c0392b" }} title="Toque na mensagem e escolha Reenviar">
        Não enviada · toque para reenviar
      </b>
    );
  if (s === "sent") return <Check size={14} color={T.mute} />;
  return <CheckCheck size={14} color={s === "read" ? T.read : T.mute} />;
}

function Avatar({
  name,
  type,
  url,
  online,
  s = 40,
}: {
  name: string;
  type?: string;
  url?: string | null;
  online?: boolean;
  s?: number;
}) {
  return (
    <div className="relative shrink-0">
      {url ? (
        <div style={{ width: s, height: s }}>
          <UserAvatar
            url={url}
            initials={initials(name)}
            className="size-full text-sm font-semibold"
          />
        </div>
      ) : (
        <div
          className="flex items-center justify-center rounded-full text-sm font-semibold"
          style={{
            width: s,
            height: s,
            background: type === "group" ? T.group : tint(name),
            color: T.ink,
          }}
        >
          {type === "group" ? <Users size={s / 2} /> : initials(name)}
        </div>
      )}
      {online ? (
        <span
          className="absolute bottom-0 right-0 rounded-full"
          style={{ width: 10, height: 10, background: T.badge, border: "2px solid #fff" }}
        />
      ) : null}
    </div>
  );
}

/** Mensagem acabada de escrever: ainda não tem id do servidor. */
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isSaved = (message: ChatMessage) =>
  message.status !== "sending" && message.status !== "failed" && SERVER_ID.test(message.id);

/**
 * Abre o anexo noutro separador. O separador abre-se já, no próprio toque:
 * aberto depois do pedido ao servidor, o Safari do telemóvel bloqueava-o.
 * Na app desktop vai para o navegador do sistema.
 */
async function openAttachment(message: ChatMessage) {
  if (!isSaved(message)) {
    toast.info("O anexo abre depois de a mensagem ser enviada.");
    return;
  }
  const tab = isTauriDesktop() ? null : window.open("about:blank", "_blank");
  try {
    const { url } = await openChatAttachment({ data: { messageId: message.id } });
    if (isTauriDesktop()) await openExternalLink(url);
    else if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else window.location.assign(url);
  } catch (error) {
    tab?.close();
    toastActionError(error, "Não foi possível abrir o anexo.");
  }
}

export function ChatDock({
  openRequest,
  onUnreadChange,
  onClose,
}: {
  /** Pedido para abrir uma conversa vindo de fora (sino de notificações, fila
   *  de avatares do drawer). O `nonce` existe porque pedir a MESMA conversa
   *  duas vezes seguidas tem de voltar a abri-la. */
  openRequest?: { conversationId: string; nonce: number } | null;
  onUnreadChange?: (total: number) => void;
  onClose?: () => void;
}) {
  const currentUser = useCurrentAccount();
  const navigate = useNavigate();
  const adapter = useMemo(
    () => createSigaChatAdapter({ id: currentUser.id, name: currentUser.name }),
    [currentUser.id, currentUser.name],
  );

  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<"emoji" | "quick" | null>(null);
  const [reply, setReply] = useState<{ id: string; from: string; text: string } | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<"loading" | ChatContact[] | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string; size: number } | null>(null);

  const activeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const olderRef = useRef<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  activeRef.current = activeId;

  const conv = convs.find((c) => c.id === activeId) ?? null;
  const activeTyping = activeId ? Boolean(typing[activeId]) : false;
  const total = convs.reduce((n, c) => n + (c.unread || 0), 0);

  const patch = useCallback(
    (id: string, fn: (c: ChatConversation) => ChatConversation) =>
      setConvs((cs) => cs.map((c) => (c.id === id ? fn(c) : c))),
    [],
  );
  const setStatus = useCallback(
    (cid: string, mid: string, status: ChatMessage["status"]) =>
      patch(cid, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === mid ? { ...m, status } : m)),
      })),
    [patch],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (olderRef.current != null) {
      el.scrollTop = el.scrollHeight - olderRef.current;
      olderRef.current = null;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeId, conv?.messages.length, activeTyping]);

  useEffect(() => {
    onUnreadChange?.(total);
  }, [onUnreadChange, total]);

  const reload = useCallback(() => adapter.listConversations().then(setConvs), [adapter]);

  const retryLoad = () => {
    setError("");
    setLoading(true);
    reload()
      .catch((caught) => {
        if (!reportPossibleSessionError(caught)) {
          setError(errorMessage(caught, "Não foi possível carregar as conversas."));
        }
      })
      .finally(() => setLoading(false));
  };

  const loadMessages = useCallback(
    (id: string) =>
      adapter
        .listMessages(id)
        .then((result) =>
          patch(id, (c) => ({
            ...c,
            messages: result.messages,
            loaded: true,
            more: result.hasMore,
          })),
        )
        .catch((error) => toastActionError(error, "Não foi possível carregar as mensagens.")),
    [adapter, patch],
  );

  useEffect(() => {
    let alive = true;
    reload()
      .then(() => {
        if (alive) setLoading(false);
      })
      .catch((caught) => {
        if (!alive) return;
        if (reportPossibleSessionError(caught)) return;
        setError(errorMessage(caught, "Não foi possível carregar as conversas."));
        setLoading(false);
      });

    const unsubscribe = adapter.subscribe({
      // O Realtime só traz a linha crua: o nome de quem enviou e a mensagem
      // respondida vêm do servidor, por isso recarrega-se em vez de inventar.
      onMessage: (cid) => {
        void reload();
        if (activeRef.current === cid) {
          void adapter.markRead(cid).catch(() => {});
          void loadMessages(cid);
        }
      },
      onUpdate: (cid, msg) =>
        patch(cid, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
        })),
      onRead: (cid, at) =>
        patch(cid, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.from === "me" && m.ts <= at ? { ...m, status: "read" } : m,
          ),
        })),
      onTyping: (cid) => {
        setTyping((t) => ({ ...t, [cid]: true }));
        setTimeout(() => setTyping((t) => ({ ...t, [cid]: false })), 3000);
      },
      onPresence: (ids) =>
        setConvs((cs) => cs.map((c) => (c.peerId ? { ...c, online: ids.includes(c.peerId) } : c))),
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [adapter, loadMessages, patch, reload]);

  const openConv = useCallback(
    (id: string) => {
      setActiveId(id);
      setDraft("");
      setReply(null);
      setPanel(null);
      setSelId(null);
      setPending(null);
      patch(id, (c) => ({ ...c, unread: 0 }));
      void adapter.markRead(id).catch(() => {});
      void loadMessages(id);
    },
    [adapter, loadMessages, patch],
  );

  useEffect(() => {
    if (openRequest?.conversationId && !loading) openConv(openRequest.conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o nonce é o sinal
  }, [openRequest?.nonce, loading]);

  const del = (mid: string) => {
    const cid = activeId;
    const before = conv?.messages.find((m) => m.id === mid);
    if (!cid || !before) return;
    patch(cid, (c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === mid ? { ...m, deleted: true, file: null, text: "" } : m,
      ),
    }));
    setSelId(null);
    void adapter.deleteMessage(mid).catch((error) => {
      // Não foi apagada: volta a aparecer como estava, em vez de sumir e
      // reaparecer só ao recarregar.
      patch(cid, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === mid ? before : m)),
      }));
      toastActionError(error, "Não foi possível apagar a mensagem.");
    });
  };

  /* A ficha do aluno junta boletim, média, frequência e situação financeira.
     Só para quem a pode abrir: um encarregado na mesma conversa não vê o atalho. */
  const canOpenStudent = canAccessPath("/alunos", currentUser.role, currentUser.grants);
  const openStudent = () => {
    const studentId = conv?.student?.id;
    if (!studentId) return;
    void navigate({ to: "/alunos/$studentId", params: { studentId } });
    onClose?.();
  };

  /**
   * Falha ao enviar. Recusa por regra (não pode escrever a esta pessoa, anexo
   * que não pode partilhar…) explica a regra: reenviar dava o mesmo erro.
   * Falha de rede ou desconhecida oferece «Reenviar» — o texto fica na conversa.
   */
  const failToSend = (error: unknown, retry: () => void) => {
    if (reportPossibleSessionError(error)) return;
    const guidance = guidanceFor(error);
    const retryable =
      !guidance ||
      guidance.kind === "network" ||
      guidance.kind === "limit" ||
      guidance.id.startsWith("generic.");
    if (!retryable) {
      toastActionError(error, "Não foi possível enviar a mensagem.");
      return;
    }
    toast.error("A mensagem não foi enviada", {
      id: "chat-send-failed",
      description:
        "Verifique a ligação à internet e toque em Reenviar. O texto ficou guardado na conversa.",
      duration: 12_000,
      action: { label: "Reenviar", onClick: retry },
    });
  };

  const deliver = (cid: string, msg: ChatMessage, file: { id: string; name: string } | null) =>
    adapter
      .sendMessage(cid, {
        text: msg.text,
        replyTo: msg.replyTo?.id,
        attachmentFileId: file?.id,
        attachmentFileName: file?.name,
      })
      .then((saved) =>
        patch(cid, (c) => ({
          ...c,
          messages: c.messages
            .filter((m) => m.id !== saved.id)
            .map((m) => (m.id === msg.id ? saved : m)),
        })),
      )
      .catch((error) => {
        setStatus(cid, msg.id, "failed");
        failToSend(error, () => resendIn(cid, msg));
      });

  const send = () => {
    const text = draft.trim();
    if ((!text && !pending) || !activeId) return;
    const cid = activeId;
    const file = pending;
    const msg: ChatMessage = {
      id: uid(),
      from: "me",
      ts: Date.now(),
      status: "sending",
      text,
      deleted: false,
      replyTo: reply,
      file: file ? { fileId: file.id, name: file.name, size: file.size } : null,
    };
    patch(cid, (c) => ({ ...c, messages: [...c.messages, msg] }));
    setDraft("");
    setReply(null);
    setPanel(null);
    setPending(null);
    if (taRef.current) taRef.current.style.height = "auto";
    if (conv?.peerId) touchRecentContact(currentUser.id, conv.peerId);
    void deliver(cid, msg, file);
  };

  const resendIn = (cid: string, msg: ChatMessage) => {
    setStatus(cid, msg.id, "sending");
    setSelId(null);
    void deliver(cid, msg, msg.file ? { id: msg.file.fileId, name: msg.file.name } : null);
  };
  const resend = (msg: ChatMessage) => {
    if (activeId) resendIn(activeId, msg);
  };

  const loadOlder = () => {
    if (!conv?.messages.length) return;
    void adapter
      .listMessages(conv.id, 60, conv.messages[0].ts)
      .then((result) => {
        olderRef.current = scrollRef.current?.scrollHeight ?? null;
        patch(conv.id, (c) => ({
          ...c,
          more: result.hasMore,
          messages: [...result.messages, ...c.messages],
        }));
      })
      .catch((error) => toastActionError(error, "Não foi possível carregar mensagens anteriores."));
  };

  const openPicker = () => {
    setPicker("loading");
    setQ("");
    adapter
      .listContacts()
      .then(setPicker)
      .catch((error) => {
        setPicker(null);
        toastActionError(error, "Não foi possível carregar os contactos.");
      });
  };

  const startChat = async (peerId: string) => {
    try {
      const id = await adapter.startDirect(peerId);
      touchRecentContact(currentUser.id, peerId);
      setConvs(await adapter.listConversations());
      setPicker(null);
      setQ("");
      openConv(id);
    } catch (error) {
      // Ex.: «Só pode enviar mensagens ao pessoal da escola.» — a regra diz a
      // quem se pode escrever, em vez de um «não foi possível» sem porquê.
      toastActionError(error, "Não foi possível iniciar a conversa.");
    }
  };

  const list = useMemo(
    () =>
      convs
        .filter((c) => {
          const last = c.messages.at(-1);
          const hit = !q || `${c.name} ${last?.text ?? ""}`.toLowerCase().includes(q.toLowerCase());
          return (
            hit && (filter === "all" || (filter === "unread" && c.unread > 0) || c.type === filter)
          );
        })
        .sort((a, b) => (b.messages.at(-1)?.ts ?? 0) - (a.messages.at(-1)?.ts ?? 0)),
    [convs, q, filter],
  );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      style={{ background: T.panel, color: T.ink, fontFamily: "system-ui, sans-serif" }}
    >
      {!conv ? (
        <>
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: T.brand, color: "#fff" }}
          >
            <div className="flex items-center gap-2 font-semibold">
              <GraduationCap size={20} />
              {picker ? "Nova conversa" : "Mensagens"}
            </div>
            <button
              type="button"
              onClick={() => {
                if (picker) {
                  setPicker(null);
                  setQ("");
                } else openPicker();
              }}
              aria-label={picker ? "Voltar às conversas" : "Nova conversa"}
              className="ml-auto mr-2 p-1"
            >
              {picker ? <ArrowLeft size={20} /> : <Plus size={20} />}
            </button>
            {onClose ? (
              <button type="button" onClick={onClose} aria-label="Recolher painel" className="p-1">
                <X size={18} />
              </button>
            ) : null}
          </div>

          <div className="p-2">
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "#fff", border: `1px solid ${T.line}` }}
            >
              <Search size={16} color={T.mute} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={picker ? "Procurar contacto" : "Procurar conversa ou mensagem"}
                aria-label={picker ? "Procurar contacto" : "Procurar conversa ou mensagem"}
                className="min-w-0 flex-1 bg-transparent outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{ fontSize: 16 }}
              />
            </div>
          </div>

          {!picker ? (
            <div className="flex gap-2 overflow-x-auto px-2 pb-2">
              {FILTERS.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs"
                  style={{
                    background: filter === k ? T.brand : "#fff",
                    color: filter === k ? "#fff" : T.ink,
                    border: `1px solid ${filter === k ? T.brand : T.line}`,
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          ) : null}

          {picker ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {picker === "loading" ? (
                <p className="p-6 text-center text-sm" style={{ color: T.mute }}>
                  A carregar contactos…
                </p>
              ) : (
                picker
                  .filter((p) => `${p.name} ${p.sub}`.toLowerCase().includes(q.toLowerCase()))
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void startChat(p.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                      style={{ borderBottom: `1px solid ${T.line}` }}
                    >
                      <Avatar name={p.name} url={p.avatarUrl} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{p.name}</div>
                        <div className="text-xs" style={{ color: T.mute }}>
                          {p.sub}
                        </div>
                      </div>
                    </button>
                  ))
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <p className="p-6 text-center text-sm" style={{ color: T.mute }}>
                  A carregar conversas…
                </p>
              ) : error ? (
                <div className="p-6 text-center text-sm" role="alert">
                  <p style={{ color: "#c0392b" }}>{error}</p>
                  <p className="mt-1" style={{ color: T.mute }}>
                    Verifique a ligação à internet e tente outra vez.
                  </p>
                  <button
                    type="button"
                    onClick={retryLoad}
                    className="mt-3 rounded-full px-4 py-2 text-sm font-semibold"
                    style={{ background: T.brand, color: "#fff", minHeight: 40 }}
                  >
                    Tentar outra vez
                  </button>
                </div>
              ) : list.length === 0 ? (
                <div className="p-6 text-center text-sm" style={{ color: T.mute }}>
                  {convs.length === 0 ? (
                    <>
                      <p className="font-semibold" style={{ color: T.ink }}>
                        Ainda não tem conversas.
                      </p>
                      <p className="mt-1">
                        {isMessagingStaff([currentUser.role])
                          ? "Toque em «Nova conversa» e escolha um colega, aluno ou encarregado."
                          : "Toque em «Nova conversa» e escolha alguém da direcção, da secretaria ou um professor."}
                      </p>
                      <button
                        type="button"
                        onClick={openPicker}
                        className="mt-3 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold"
                        style={{ background: T.brand, color: "#fff", minHeight: 40 }}
                      >
                        <Plus size={16} /> Nova conversa
                      </button>
                    </>
                  ) : (
                    <>
                      <p>Nenhuma conversa corresponde à pesquisa ou ao filtro.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setQ("");
                          setFilter("all");
                        }}
                        className="mt-2 underline"
                        style={{ color: T.brandDark }}
                      >
                        Limpar pesquisa e filtro
                      </button>
                    </>
                  )}
                </div>
              ) : null}
              {list.map((c) => {
                const last = c.messages.at(-1);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openConv(c.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    style={{ borderBottom: `1px solid ${T.line}` }}
                  >
                    <Avatar name={c.name} type={c.type} url={c.avatarUrl} online={c.online} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{c.name}</span>
                        <span
                          className="shrink-0 text-xs"
                          style={{ color: c.unread > 0 ? T.badge : T.mute }}
                        >
                          {last ? listTime(last.ts) : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="flex items-center gap-1 truncate text-xs"
                          style={{ color: T.mute }}
                        >
                          {last?.from === "me" ? <Ticks s={last.status} /> : null}
                          {typing[c.id]
                            ? "a escrever…"
                            : last
                              ? last.deleted
                                ? "Mensagem apagada"
                                : last.text
                              : ""}
                        </span>
                        {c.unread > 0 ? (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-center text-xs"
                            style={{ background: T.badge, color: "#fff", minWidth: 20 }}
                          >
                            {c.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className="flex items-center gap-2 px-2 py-2"
            style={{ background: T.brand, color: "#fff" }}
          >
            <button
              type="button"
              onClick={() => setActiveId(null)}
              aria-label="Voltar"
              className="p-1"
            >
              <ArrowLeft size={20} />
            </button>
            <Avatar
              name={conv.name}
              type={conv.type}
              url={conv.avatarUrl}
              online={conv.online}
              s={36}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{conv.name}</div>
              <div className="truncate text-xs" style={{ opacity: 0.85 }}>
                {typing[conv.id] ? "a escrever…" : conv.online ? "online" : conv.sub}
              </div>
            </div>
            {onClose ? (
              <button type="button" onClick={onClose} aria-label="Recolher painel" className="p-1">
                <X size={18} />
              </button>
            ) : null}
          </div>

          {conv.student && canOpenStudent ? (
            <div
              className="flex gap-2 overflow-x-auto px-2 py-2"
              style={{ background: "#fff", borderBottom: `1px solid ${T.line}` }}
            >
              <button
                type="button"
                onClick={openStudent}
                className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs"
                style={{ border: `1px solid ${T.line}`, color: T.brandDark, minHeight: 32 }}
              >
                <ClipboardList size={13} />
                Ficha do aluno · boletim e frequência
              </button>
            </div>
          ) : null}

          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            tabIndex={-1}
            onClick={() => setSelId(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelId(null);
            }}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
            style={{ background: T.wall }}
          >
            {conv.more ? (
              <div className="mb-2 text-center">
                <button
                  type="button"
                  onClick={loadOlder}
                  className="rounded-full px-3 py-1.5 text-xs"
                  style={{ background: "#fff", color: T.brandDark }}
                >
                  Carregar mensagens anteriores
                </button>
              </div>
            ) : null}

            {conv.messages.map((mm, i) => {
              const prev = conv.messages[i - 1];
              const own = mm.from === "me";
              return (
                <div key={mm.id}>
                  {!prev || dayKey(prev.ts) !== dayKey(mm.ts) ? (
                    <div className="my-2 text-center">
                      <span
                        className="rounded-lg px-3 py-1 text-xs"
                        style={{ background: "#fff", color: T.mute }}
                      >
                        {dayLabel(mm.ts)}
                      </span>
                    </div>
                  ) : null}
                  <div className={`my-0.5 flex ${own ? "justify-end" : "justify-start"}`}>
                    <div style={{ maxWidth: "82%" }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelId(selId === mm.id ? null : mm.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelId(selId === mm.id ? null : mm.id);
                          }
                        }}
                        className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm shadow-sm"
                        style={{ background: own ? T.out : "#fff" }}
                      >
                        {conv.type === "group" && !own ? (
                          <div className="text-xs font-semibold" style={{ color: T.brandDark }}>
                            {mm.from}
                          </div>
                        ) : null}
                        {mm.replyTo ? (
                          <div
                            className="mb-1 rounded px-2 py-1 text-xs"
                            style={{
                              background: "rgba(0,0,0,.06)",
                              borderLeft: `3px solid ${T.brand}`,
                            }}
                          >
                            <b>{mm.replyTo.from === "me" ? "Você" : mm.replyTo.from}</b>
                            <div className="truncate">{mm.replyTo.text || "📎 Anexo"}</div>
                          </div>
                        ) : null}
                        {mm.deleted ? (
                          <i style={{ color: T.mute }}>🚫 Mensagem apagada</i>
                        ) : (
                          <>
                            {mm.file ? (
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openAttachment(mm);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void openAttachment(mm);
                                  }
                                }}
                                className="mb-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5"
                                style={{ background: "rgba(0,0,0,.06)" }}
                              >
                                <FileText size={22} color={T.brand} />
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-semibold">
                                    {mm.file.name}
                                  </div>
                                  {mm.file.size > 0 ? (
                                    <div className="text-xs" style={{ color: T.mute }}>
                                      {fsize(mm.file.size)}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                            <span className="whitespace-pre-wrap break-words">{mm.text}</span>
                          </>
                        )}
                        <span
                          className="float-right ml-2 mt-1 flex items-center gap-1"
                          style={{ color: T.mute, fontSize: 10 }}
                        >
                          {hm(mm.ts)}
                          {own ? <Ticks s={mm.status} /> : null}
                        </span>
                        <div style={{ clear: "both" }} />
                      </div>

                      {selId === mm.id && !mm.deleted ? (
                        <div className={`mt-1 flex gap-2 ${own ? "justify-end" : ""}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setReply({ id: mm.id, from: mm.from, text: mm.text });
                              setSelId(null);
                              taRef.current?.focus();
                            }}
                            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs"
                            style={{ background: "#fff" }}
                          >
                            <CornerUpLeft size={12} />
                            Responder
                          </button>
                          {mm.status === "failed" ? (
                            <button
                              type="button"
                              onClick={() => resend(mm)}
                              className="rounded-full px-2 py-1 text-xs"
                              style={{ background: "#fff", color: "#c0392b" }}
                            >
                              Reenviar
                            </button>
                          ) : null}
                          {own ? (
                            <button
                              type="button"
                              onClick={() => del(mm.id)}
                              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs"
                              style={{ background: "#fff", color: "#c0392b" }}
                            >
                              <Trash2 size={12} />
                              Apagar
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}

            {typing[conv.id] ? (
              <div
                className="inline-block rounded-lg px-3 py-1.5 text-xs"
                style={{ background: "#fff", color: T.mute }}
              >
                a escrever…
              </div>
            ) : null}
          </div>

          {reply ? (
            <div
              className="flex items-center gap-2 px-3 py-2 text-xs"
              style={{ background: "#fff", borderTop: `1px solid ${T.line}` }}
            >
              <div className="min-w-0 flex-1 pl-2" style={{ borderLeft: `3px solid ${T.brand}` }}>
                <b>{reply.from === "me" ? "Você" : reply.from}</b>
                <div className="truncate" style={{ color: T.mute }}>
                  {reply.text || "📎 Anexo"}
                </div>
              </div>
              <button type="button" onClick={() => setReply(null)} aria-label="Cancelar resposta">
                <X size={16} />
              </button>
            </div>
          ) : null}

          {pending ? (
            <div
              className="flex items-center gap-2 px-3 py-2 text-xs"
              style={{ background: "#fff", borderTop: `1px solid ${T.line}` }}
            >
              <FileText size={16} color={T.brand} />
              <span className="min-w-0 flex-1 truncate">{pending.name}</span>
              <button type="button" onClick={() => setPending(null)} aria-label="Remover anexo">
                <X size={16} />
              </button>
            </div>
          ) : null}

          {panel === "emoji" ? (
            <div
              className="grid grid-cols-8 gap-1 p-2"
              style={{ background: "#fff", borderTop: `1px solid ${T.line}` }}
            >
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setDraft((d) => d + e)}
                  className="text-xl"
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}

          {panel === "quick" ? (
            <div
              className="flex flex-col gap-1 p-2"
              style={{ background: "#fff", borderTop: `1px solid ${T.line}` }}
            >
              {QUICK.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setDraft(t);
                    setPanel(null);
                    taRef.current?.focus();
                  }}
                  className="rounded-lg px-3 py-2 text-left text-xs"
                  style={{ border: `1px solid ${T.line}` }}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}

          <div
            className="flex items-end gap-1 p-2"
            style={{ background: T.panel, borderTop: `1px solid ${T.line}` }}
          >
            <button
              type="button"
              onClick={() => setPanel(panel === "emoji" ? null : "emoji")}
              aria-label="Emojis"
              className="p-2"
            >
              <Smile size={22} color={T.mute} />
            </button>
            <button
              type="button"
              onClick={() => setPanel(panel === "quick" ? null : "quick")}
              aria-label="Mensagens rápidas"
              className="p-2"
            >
              <Zap size={20} color={T.mute} />
            </button>
            {/* Anexo vem da Biblioteca de Arquivos da escola: o ficheiro fica
                auditado e com as permissões que já existem, em vez de um bucket
                paralelo só do chat. */}
            <PickFileButton
              variant="ghost"
              size="sm"
              onPick={(file: SchoolFileRecord) =>
                setPending({ id: file.id, name: file.name, size: file.sizeBytes })
              }
            >
              <FileText size={20} color={T.mute} />
            </PickFileButton>
            <textarea
              ref={taRef}
              rows={1}
              value={draft}
              placeholder="Escreva uma mensagem"
              className="min-w-0 flex-1 resize-none rounded-2xl px-3 py-2 outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              style={{ fontSize: 16, background: "#fff", border: `1px solid ${T.line}` }}
              onChange={(e) => {
                setDraft(e.target.value);
                if (activeId) adapter.setTyping(activeId);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  window.matchMedia("(pointer: fine)").matches
                ) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() && !pending}
              aria-label="Enviar"
              className="rounded-full p-2.5"
              style={{
                background: T.brand,
                color: "#fff",
                opacity: draft.trim() || pending ? 1 : 0.45,
              }}
            >
              <Send size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
