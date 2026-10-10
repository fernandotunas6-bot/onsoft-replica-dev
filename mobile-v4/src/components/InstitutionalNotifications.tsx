import { useEffect, useRef, useState } from "react";
import type { Context, Gateway } from "../domain/model";
import type { NotificationInbox } from "../domain/notifications";
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
  const [reload, setReload] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const access = useRef(onAccessError);
  access.current = onAccessError;
  useEffect(() => {
    setUnreadOnly(false);
    setQuery("");
  }, [key]);
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
        if (live) {
          setError(e instanceof Error ? e.message : "Não foi possível carregar os avisos.");
          if (e instanceof ApiError && [401, 403].includes(e.status)) access.current?.(e);
        }
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
  const items =
    inbox?.items.filter(
      (x) =>
        (!unreadOnly || !x.read) &&
        `${x.title} ${x.body}`.toLocaleLowerCase("pt").includes(query.toLocaleLowerCase("pt")),
    ) ?? [];
  return (
    <section className="academic" style={{ overflowWrap: "anywhere" }}>
      <p>Os teus 50 avisos mais recentes nesta escola. Consultar não marca como lido.</p>
      <button className="pill" disabled={loading} onClick={() => setReload((n) => n + 1)}>
        Actualizar avisos
      </button>
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
            </article>
          ))}
        </>
      )}
    </section>
  );
}
