import { useEffect, useRef, useState } from "react";
import type { Context, Gateway } from "../domain/model";
import type { NotificationInbox, NotificationReadTarget } from "../domain/notifications";
import { ApiError } from "../services/api";
export function InstitutionalNotifications({
  ctx,
  gateway,
  onAccessError,
}: {
  ctx: Context;
  gateway: Gateway;
  onAccessError?: (error: ApiError) => void;
}) {
  const key = `${ctx.userId}:${ctx.schoolId}:${ctx.role}`;
  const [loaded, setLoaded] = useState<{ key: string; data: NotificationInbox } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const access = useRef(onAccessError);
  access.current = onAccessError;
  // Chave em vigor: uma resposta de outra escola ou conta é descartada.
  const current = useRef(key);
  current.current = key;
  useEffect(() => {
    setUnreadOnly(false);
    setQuery("");
  }, [key]);
  const fail = (e: unknown, fallback: string, write = false) => {
    // Numa escrita, 403 é quase sempre a falta do segundo factor nesta sessão:
    // não é motivo para sair da escola, que continua legível.
    if (write && e instanceof ApiError && e.status === 403) {
      setError(
        "Não foi possível marcar como lido. Entre com o segundo factor (código ou chave de acesso) e tente de novo.",
      );
      return;
    }
    setError(e instanceof Error ? e.message : fallback);
    if (e instanceof ApiError && [401, 403].includes(e.status)) access.current?.(e);
  };
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setLoaded(null);
    setError("");
    setLoading(true);
    const request =
      gateway.notifications?.(ctx, controller.signal) ??
      Promise.reject(new Error("A consulta de avisos não está disponível nesta ligação."));
    request
      .then((data) => {
        if (live) setLoaded({ key, data });
      })
      .catch((e) => {
        if (live) fail(e, "Não foi possível carregar os avisos.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [ctx, key, gateway, reload]);
  const inbox = loaded?.key === key ? loaded.data : null;
  const loadMore = async () => {
    if (!inbox?.next || !gateway.notifications) return;
    const requestKey = key;
    setBusy(true);
    setError("");
    try {
      const page = await gateway.notifications(ctx, undefined, inbox.next);
      if (current.current !== requestKey) return;
      setLoaded((prev) => {
        if (!prev || prev.key !== requestKey) return prev;
        const seen = new Set(prev.data.items.map((x) => x.id));
        return {
          key: requestKey,
          data: {
            ...prev.data,
            unread: page.unread,
            items: [...prev.data.items, ...page.items.filter((x) => !seen.has(x.id))],
            next: page.next,
          },
        };
      });
    } catch (e) {
      if (current.current === requestKey) fail(e, "Não foi possível carregar mais avisos.");
    } finally {
      setBusy(false);
    }
  };
  const markRead = async (target: NotificationReadTarget) => {
    if (!gateway.markNotificationsRead) return;
    const requestKey = key;
    setBusy(true);
    setError("");
    try {
      const receipt = await gateway.markNotificationsRead(ctx, target);
      if (current.current !== requestKey) return;
      const ids = "ids" in target ? new Set(target.ids) : null;
      setLoaded((prev) =>
        !prev || prev.key !== requestKey
          ? prev
          : {
              key: requestKey,
              data: {
                ...prev.data,
                unread: receipt.unread,
                items: prev.data.items.map((x) =>
                  !ids || ids.has(x.id) ? { ...x, read: true } : x,
                ),
              },
            },
      );
    } catch (e) {
      if (current.current === requestKey)
        fail(e, "Não foi possível marcar os avisos como lidos.", true);
    } finally {
      setBusy(false);
    }
  };
  const canMark = Boolean(gateway.markNotificationsRead);
  const items =
    inbox?.items.filter(
      (x) =>
        (!unreadOnly || !x.read) &&
        `${x.title} ${x.body}`.toLocaleLowerCase("pt").includes(query.toLocaleLowerCase("pt")),
    ) ?? [];
  return (
    <section className="academic" style={{ overflowWrap: "anywhere" }}>
      <p>
        Os teus avisos nesta escola, dos mais recentes para os mais antigos. Consultar não marca
        como lido.
      </p>
      <div className="flow-actions">
        <button className="pill" disabled={loading || busy} onClick={() => setReload((n) => n + 1)}>
          Actualizar avisos
        </button>
        {canMark && inbox && inbox.unread > 0 && (
          <button className="pill" disabled={busy} onClick={() => markRead({ all: true })}>
            Marcar todos como lidos
          </button>
        )}
      </div>
      {loading && <p role="status">A carregar avisos…</p>}
      {error && <p role="alert">{error}</p>}
      {inbox && (
        <>
          <p role="status">{inbox.unread} não lidas nesta escola</p>
          <label className="checkline">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />{" "}
            Apenas não lidas
          </label>
          <label>
            Pesquisar avisos
            <input
              aria-label="Pesquisar avisos"
              placeholder="Pesquisar avisos"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {items.length === 0 && <p>Nenhum aviso encontrado.</p>}
          {items.map((item) => (
            <article className="card" key={item.id}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <p>
                {item.read ? "Lida" : "Não lida"} ·{" "}
                <time dateTime={item.createdAt}>
                  {new Intl.DateTimeFormat("pt-AO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Africa/Luanda",
                  }).format(new Date(item.createdAt))}
                </time>
              </p>
              {canMark && !item.read && (
                <button
                  className="pill"
                  disabled={busy}
                  aria-label={`Marcar «${item.title}» como lido`}
                  onClick={() => markRead({ ids: [item.id] })}
                >
                  Marcar como lido
                </button>
              )}
            </article>
          ))}
          {inbox.next && (
            <button className="pill" disabled={busy} onClick={loadMore}>
              Mostrar avisos mais antigos
            </button>
          )}
        </>
      )}
    </section>
  );
}
