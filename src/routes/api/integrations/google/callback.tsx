import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { completeGoogleWorkspaceOAuth } from "@/integrations/google/workspace-auth";

// style-check: route-exempt — OAuth provider callback.
export const Route = createFileRoute("/api/integrations/google/callback")({
  validateSearch: (raw: Record<string, unknown>) => ({
    code: typeof raw["code"] === "string" ? raw["code"] : "",
    state: typeof raw["state"] === "string" ? raw["state"] : "",
    error: typeof raw["error"] === "string" ? raw["error"] : "",
  }),
  component: GoogleWorkspaceCallback,
});
function GoogleWorkspaceCallback() {
  const { code, state, error } = Route.useSearch();
  const invoked = useRef(false);
  const [message, setMessage] = useState("A validar a autorização Google…");
  useEffect(() => {
    // Clear the authorization code before any third-party script or navigation.
    window.history.replaceState(null, "", "/api/integrations/google/callback");
    if (invoked.current) return;
    invoked.current = true;
    if (error || !state || !code) {
      setMessage("A autorização Google foi recusada ou está incompleta.");
      return;
    }
    void completeGoogleWorkspaceOAuth({ data: { code, state } })
      .then(() => {
        window.location.replace("/configuracoes?google_workspace=connected");
      })
      .catch((cause: unknown) => {
        console.error("[Google Workspace] callback error", cause);
        setMessage("Não foi possível concluir a ligação. Confirme a sessão e tente novamente.");
      });
  }, [code, state, error]);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-5 p-8">
      <h1 className="text-xl font-bold">Google Workspace</h1>
      <p role="status" className="text-center text-sm text-muted-foreground">{message}</p>
      <a href="/configuracoes" className="rounded-xl border border-border px-4 py-2 text-sm">
        Voltar às definições
      </a>
    </main>
  );
}
