import { useEffect, useRef, useState } from "react";
import type { Context, Gateway } from "../domain/model";
import type { ChatInbox, ChatHistory, ChatCursor, ChatCommand } from "../domain/institutional-chat";
import { ApiError } from "../services/api";
import { Icon } from "./Icon";
export function InstitutionalChat({
  ctx,
  gateway,
  onAccessError,
}: {
  ctx: Context;
  gateway: Gateway;
  onAccessError?: (e: ApiError) => void;
}) {
  const key = `${ctx.userId}:${ctx.schoolId}:${ctx.role}`;
  const [inbox, setInbox] = useState<{ key: string; data: ChatInbox } | null>(null);
  const [history, setHistory] = useState<{
    key: string;
    conversationId: string;
    data: ChatHistory;
  } | null>(null);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<{
    key: string;
    conversationId: string;
    messageId: string;
    url: string;
  } | null>(null);
  const [opening, setOpening] = useState("");
  const [capabilities, setCapabilities] = useState<{ key: string; writes: boolean } | null>(null);
  const [contacts, setContacts] = useState<{
    key: string;
    items: { id: string; name: string }[];
  } | null>(null);
  const [newConversation, setNewConversation] = useState(false);
  const [draft, setDraft] = useState<{ key: string; conversationId: string; body: string }>({
    key: "",
    conversationId: "",
    body: "",
  });
  const [reply, setReply] = useState<{ key: string; conversationId: string; id: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pending = useRef(new Map<string, string>());
  const writes = capabilities?.key === key && capabilities.writes === true && !!gateway.chatCommand;
  const access = useRef(onAccessError);
  access.current = onAccessError;
  const threads = inbox?.key === key ? inbox.data.threads : [];
  const thread = threads.find((t) => t.id === selected);
  const active = thread?.id ?? "";
  const messages = history?.key === key && history.conversationId === active ? history.data : null;
  const location = useRef({ key, active });
  location.current = { key, active };
  const currentDraft = draft.key === key && draft.conversationId === active ? draft.body : "";
  const replyMessage =
    reply?.key === key && reply.conversationId === active
      ? messages?.messages.find((m) => m.id === reply.id && !m.deleted)
      : null;
  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    gateway
      .chatCapabilities?.(ctx, ac.signal)
      .then((data) => {
        if (live) setCapabilities({ key, writes: data.writes });
      })
      .catch(() => {
        if (live) setCapabilities({ key, writes: false });
      });
    gateway
      .chatContacts?.(ctx, ac.signal)
      .then((items) => {
        if (live) setContacts({ key, items });
      })
      .catch(() => {
        if (live) setContacts(null);
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [ctx, key, gateway]);
  useEffect(() => {
    setNewConversation(false);
    pending.current.clear();
  }, [key]);
  async function commit(command: ChatCommand) {
    if (!writes || busyRef.current || !gateway.chatCommand) return;
    const snapshot = { key, active };
    busyRef.current = true;
    setBusy(true);
    setError("");
    const fingerprint = key + JSON.stringify(command);
    const requestId = pending.current.get(fingerprint) ?? crypto.randomUUID();
    pending.current.set(fingerprint, requestId);
    try {
      const receipt = await gateway.chatCommand(ctx, requestId, command);
      pending.current.delete(fingerprint);
      if (location.current.key === snapshot.key && location.current.active === snapshot.active) {
        if (command.type === "start") {
          setSelected(receipt.conversationId);
          setPages(1);
          setNewConversation(false);
        }
        if (command.type === "send") {
          setDraft({ key, conversationId: active, body: "" });
          setReply(null);
        }
        setReload((n) => n + 1);
      }
    } catch (e) {
      if (location.current.key === snapshot.key && location.current.active === snapshot.active) {
        setError(e instanceof Error ? e.message : "Não foi possível guardar a operação.");
        if (e instanceof ApiError && e.status === 401) access.current?.(e);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    setAttachment(null);
    setOpening("");
  }, [key, active, reload]);
  useEffect(() => {
    if (!attachment) return;
    const timer = setTimeout(() => setAttachment(null), 540000);
    return () => clearTimeout(timer);
  }, [attachment]);
  async function openAttachment(messageId: string) {
    const snapshot = { key, active };
    setOpening(messageId);
    setError("");
    try {
      if (!gateway.chatAttachment)
        throw new Error("Os anexos não estão disponíveis nesta ligação.");
      const file = await gateway.chatAttachment(ctx, messageId);
      if (location.current.key === snapshot.key && location.current.active === snapshot.active)
        setAttachment({ key, conversationId: active, messageId, url: file.url });
    } catch (e) {
      if (location.current.key === snapshot.key && location.current.active === snapshot.active) {
        setError(e instanceof Error ? e.message : "Não foi possível abrir o anexo.");
        if (e instanceof ApiError && [401, 403].includes(e.status)) access.current?.(e);
      }
    } finally {
      if (location.current.key === snapshot.key && location.current.active === snapshot.active)
        setOpening("");
    }
  }
  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setError("");
    const request =
      gateway.chatInbox?.(ctx, ac.signal) ??
      Promise.reject(new Error("O chat não está disponível nesta ligação."));
    request
      .then((data) => {
        if (live) setInbox({ key, data });
      })
      .catch((e) => {
        if (live) {
          setInbox(null);
          setHistory(null);
          setError(e.message);
          if (e instanceof ApiError && [401, 403].includes(e.status)) access.current?.(e);
        }
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [ctx, key, gateway, reload]);
  useEffect(() => {
    if (!active) {
      setHistory(null);
      return;
    }
    let live = true;
    const ac = new AbortController();
    setLoading(true);
    setError("");
    (async () => {
      if (!gateway.chatHistory) throw new Error("O histórico não está disponível nesta ligação.");
      let cursor: ChatCursor | undefined;
      let data!: ChatHistory;
      const all: ChatHistory["messages"] = [];
      for (let n = 0; n < pages; n++) {
        data = await gateway.chatHistory(ctx, active, cursor, ac.signal);
        all.unshift(...data.messages);
        if (!data.next) break;
        cursor = data.next;
      }
      const merged = [...new Map(all.map((m) => [m.id, m])).values()].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
      if (live) setHistory({ key, conversationId: active, data: { ...data, messages: merged } });
    })()
      .catch((e) => {
        if (live) {
          setHistory(null);
          setError(e.message);
          if (e instanceof ApiError && [401, 403].includes(e.status)) access.current?.(e);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [ctx, key, gateway, active, reload, pages]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReload((n) => n + 1), 250);
    };
    const stop = gateway.subscribeChatChanged?.(ctx, changed);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") changed();
    }, 30000);
    return () => {
      stop?.();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
  }, [ctx, gateway]);
  return (
    <section className={active ? "chat-page" : ""}>
      <button className="pill" disabled={loading} onClick={() => setReload((n) => n + 1)}>
        Actualizar conversas
      </button>
      {error && <p role="alert">{error}</p>}
      {!active ? (
        <>
          <h2>Conversas</h2>
          <button
            className="pill"
            disabled={!writes || busy}
            onClick={() => setNewConversation((v) => !v)}
          >
            Nova conversa
          </button>
          {newConversation && contacts?.key === key && (
            <div>
              {contacts.items.map((c) => (
                <button
                  className="contact-row"
                  disabled={busy}
                  key={c.id}
                  onClick={() => void commit({ type: "start", peerId: c.id })}
                >
                  <span className="contact-avatar">{c.name.slice(0, 1)}</span>
                  <b>{c.name}</b>
                </button>
              ))}
              {!contacts.items.length && <p>Sem contactos disponíveis nesta escola.</p>}
            </div>
          )}
          {!writes && (
            <p className="small">
              As operações de escrita do chat aguardam a instalação e validação da migração num
              ambiente de testes.
            </p>
          )}
          <label className="sr-only" htmlFor="institutional-chat-search">
            Pesquisar conversas
          </label>
          <input
            className="search"
            id="institutional-chat-search"
            placeholder="Pesquisar conversa…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {threads
            .filter((t) => t.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
            .map((t) => (
              <button
                className="contact-row"
                key={t.id}
                onClick={() => {
                  setSelected(t.id);
                  setPages(1);
                  setHistory(null);
                }}
              >
                <span className="contact-avatar">{t.name.slice(0, 1)}</span>
                <span className="grow">
                  <b>{t.name}</b>
                  <span className="muted">
                    {t.type === "group" ? "Grupo escolar" : "Conversa directa"} · {t.unread} não
                    lidas{t.peerLeft ? " · Participante saiu da escola" : ""}
                  </span>
                </span>
                <Icon name="chevron-right" />
              </button>
            ))}
          {inbox?.key === key && !threads.length && <p>Sem conversas nesta escola.</p>}
        </>
      ) : (
        <>
          <div className="thread-header">
            <button
              className="round"
              aria-label="Voltar às conversas"
              onClick={() => {
                setSelected("");
                setHistory(null);
                setPages(1);
              }}
            >
              <Icon name="chevron-left" />
            </button>
            <b>{thread!.name}</b>
          </div>
          <button
            className="pill"
            disabled={!writes || busy || !messages?.messages.length}
            onClick={() =>
              void commit({
                type: "read",
                conversationId: active,
                messageId: messages!.messages.at(-1)!.id,
              })
            }
          >
            Marcar como lida
          </button>
          {loading && <p role="status">A carregar mensagens…</p>}
          {messages?.next && (
            <button
              className="pill"
              disabled={loading || pages >= 20}
              onClick={() => setPages((n) => n + 1)}
            >
              Carregar anteriores
            </button>
          )}
          <div
            className="thread-messages"
            role="log"
            aria-label="Mensagens da conversa"
            aria-live="polite"
          >
            {messages?.messages.map((m) => (
              <article
                key={m.id}
                className={"message-bubble " + (m.senderId === ctx.userId ? "sent" : "received")}
              >
                {thread!.type === "group" && m.senderId !== ctx.userId && <b>{m.senderName}</b>}
                {m.reply && (
                  <blockquote>
                    {m.reply.senderName}: {m.reply.body || "Mensagem eliminada"}
                  </blockquote>
                )}
                <p>{m.deleted ? "Mensagem eliminada" : m.body}</p>
                {m.attachment && (
                  <div>
                    <p>Anexo: {m.attachment.name}</p>
                    {attachment?.key === key &&
                    attachment.conversationId === active &&
                    attachment.messageId === m.id ? (
                      <a
                        className="pill"
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir {m.attachment.name}
                      </a>
                    ) : (
                      <button
                        className="pill"
                        disabled={opening === m.id}
                        onClick={() => void openAttachment(m.id)}
                      >
                        {opening === m.id ? "A verificar acesso…" : "Abrir anexo"}
                      </button>
                    )}
                  </div>
                )}
                {!m.deleted && (
                  <div>
                    <button
                      className="pill"
                      disabled={!writes || busy || thread!.peerLeft}
                      onClick={() => setReply({ key, conversationId: active, id: m.id })}
                    >
                      Responder
                    </button>
                    {m.senderId === ctx.userId && (
                      <button
                        className="pill"
                        disabled={!writes || busy}
                        onClick={() =>
                          void commit({ type: "delete", conversationId: active, messageId: m.id })
                        }
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
                <time dateTime={m.createdAt}>
                  {new Date(m.createdAt).toLocaleString("pt-AO", {
                    timeZone: "Africa/Luanda",
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                  {m.senderId === ctx.userId
                    ? m.status === "read"
                      ? " · Lida"
                      : " · Enviada"
                    : ""}
                </time>
              </article>
            ))}
            {messages && !messages.messages.length && <p>Sem mensagens nesta conversa.</p>}
          </div>
          {replyMessage && (
            <div className="small">
              A responder a {replyMessage.senderName}: {replyMessage.body}
              <button className="pill" onClick={() => setReply(null)}>
                Cancelar resposta
              </button>
            </div>
          )}
          <form
            className="thread-composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (currentDraft.trim())
                void commit({
                  type: "send",
                  conversationId: active,
                  body: currentDraft.trim(),
                  ...(replyMessage ? { replyTo: replyMessage.id } : {}),
                });
            }}
          >
            <label className="sr-only" htmlFor="institutional-chat-draft">
              Mensagem
            </label>
            <textarea
              id="institutional-chat-draft"
              placeholder="Escrever mensagem…"
              maxLength={4000}
              value={currentDraft}
              disabled={!writes || busy || thread!.peerLeft}
              onChange={(e) => setDraft({ key, conversationId: active, body: e.target.value })}
            />
            <button
              className="round primary"
              aria-label="Enviar mensagem"
              disabled={!writes || busy || thread!.peerLeft || !currentDraft.trim()}
            >
              <Icon name="arrow-up" />
            </button>
          </form>
          {!writes && (
            <p className="small">
              Envio, respostas, eliminação e leitura aguardam a instalação e validação da migração
              num ambiente de testes. Nenhuma mensagem será guardada por um serviço alternativo.
            </p>
          )}
          {thread!.peerLeft && (
            <p className="small">O participante já não está activo nesta escola.</p>
          )}
        </>
      )}
    </section>
  );
}
