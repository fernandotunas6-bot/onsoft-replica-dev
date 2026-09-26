import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { completeZoomOAuth } from "@/features/integrations/zoom";

// style-check: route-exempt — endpoint de callback OAuth do Zoom.

export const Route = createFileRoute("/api/integrations/zoom/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search["code"] === "string" ? search["code"] : "",
    state: typeof search["state"] === "string" ? search["state"] : "",
    error: typeof search["error"] === "string" ? search["error"] : "",
  }),
  component: ZoomOAuthCallbackPage,
});

function ZoomOAuthCallbackPage() {
  const search = Route.useSearch();

  if (search.error) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center space-y-4">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive inline-flex">
          <span className="text-2xl">⚠</span>
        </div>
        <h1 className="text-lg font-bold text-foreground">Autorização Recusada</h1>
        <p className="text-xs text-muted-foreground">
          O Zoom comunicou o seguinte erro: <code>{search.error}</code>.
        </p>
        <a
          href="/configuracoes"
          className="inline-block text-xs font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Voltar às Configurações
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16 text-center space-y-4">
      <div className="rounded-full bg-primary/10 p-3 text-primary inline-flex animate-pulse">
        <span className="text-2xl">✓</span>
      </div>
      <h1 className="text-lg font-bold text-foreground">A Conectar ao Zoom...</h1>
      <p className="text-xs text-muted-foreground">
        A validar as credenciais e autorização da instituição com o Zoom.
      </p>
      <ZoomCallbackHandler code={search.code} state={search.state} />
    </main>
  );
}

function ZoomCallbackHandler({ code, state }: { code: string; state: string }) {
  // O código OAuth só vale uma vez. Trocado durante o render, corria em cada
  // re-render; a segunda troca falhava e mandava para o erro mesmo com a
  // ligação feita. Num efeito, com guarda, corre uma única vez.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !code || !state) return;
    started.current = true;
    completeZoomOAuth({ data: { code, state } })
      .then(() => {
        window.location.href = "/configuracoes?zoom=connected";
      })
      .catch((err) => {
        const msg = encodeURIComponent(err?.message || "Falha na conexão Zoom");
        window.location.href = `/configuracoes?zoom_error=${msg}`;
      });
  }, [code, state]);

  return null;
}
