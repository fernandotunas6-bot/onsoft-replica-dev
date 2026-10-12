import { useEffect, useRef, useState } from "react";
import type { Workspace, Context, Command } from "../domain/model";
import { Icon } from "../components/Icon";
export function ChatPage({
  data,
  ctx,
  execute,
  busy,
}: {
  data: Workspace;
  ctx: Context;
  execute: (command: Command) => Promise<boolean>;
  busy: boolean;
}) {
  const contacts = Array.from(
    new Map(
      data.classes.flatMap((g) =>
        ctx.role === "professor"
          ? g.students.map((s) => [s.userId, s.name] as const)
          : [[g.teacherUserId, "Professor · " + g.subject] as const],
      ),
    ).entries(),
  );
  const [peer, setPeer] = useState("");
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const messages = data.messages
    .filter(
      (m) => (m.from === ctx.userId && m.to === peer) || (m.to === ctx.userId && m.from === peer),
    )
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  useEffect(() => {
    end.current?.scrollIntoView?.({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [messages.length, peer]);
  if (!peer)
    return (
      <section>
        <h2>Conversas</h2>
        <label className="sr-only" htmlFor="chat-search">
          Pesquisar contactos
        </label>
        <input
          id="chat-search"
          className="search"
          placeholder="Pesquisar professor ou aluno…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {contacts
          .filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()))
          .map(([id, name]) => {
            const last = data.messages.filter((m) => m.from === id || m.to === id).at(-1);
            return (
              <button key={id} className="contact-row" onClick={() => setPeer(id)}>
                <span className="contact-avatar">{name.slice(0, 1)}</span>
                <span className="grow">
                  <b>{name}</b>
                  <span className="muted">{last?.text || "Iniciar conversa"}</span>
                </span>
                <Icon name="chevron-right" />
              </button>
            );
          })}
        {!contacts.length && <div className="card">Sem contactos autorizados nesta escola.</div>}
      </section>
    );
  return (
    <section className="chat-page">
      <div className="thread-header">
        <button
          className="round"
          aria-label="Voltar aos contactos"
          onClick={() => {
            setPeer("");
            setText("");
          }}
        >
          <Icon name="chevron-left" />
        </button>
        <b>{contacts.find(([id]) => id === peer)?.[1]}</b>
      </div>
      <div
        className="thread-messages"
        role="log"
        aria-label="Mensagens da conversa"
        aria-live="polite"
      >
        {messages.length ? (
          messages.map((m) => (
            <article
              key={m.id}
              className={"message-bubble " + (m.from === ctx.userId ? "sent" : "received")}
            >
              <p>{m.text}</p>
              <time dateTime={m.sentAt}>
                {new Date(m.sentAt).toLocaleTimeString("pt-AO", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Africa/Luanda",
                })}
              </time>
            </article>
          ))
        ) : (
          <p className="muted">Começa uma conversa sobre as aulas.</p>
        )}
        <div ref={end} />
      </div>
      <form
        className="thread-composer"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if (await execute({ type: "message", to: peer, text })) setText("");
        }}
      >
        <label className="sr-only" htmlFor="chat-text">
          Mensagem
        </label>
        <textarea
          id="chat-text"
          placeholder="Escreve uma mensagem…"
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <button
          className="round primary"
          type="submit"
          aria-label="Enviar mensagem"
          disabled={busy || !text.trim()}
        >
          <Icon name="arrow-up" />
        </button>
      </form>
      <p className="small">Contactos e conversas limitados ao contexto escolar autorizado.</p>
    </section>
  );
}
