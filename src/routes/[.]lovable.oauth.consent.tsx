// style-check: route-exempt - ecrã de consentimento OAuth para ligar um agente, sem shell administrativo.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Autorizar agente — SIGA Plus" },
      {
        name: "description",
        content: "Aprovar o acesso de um assistente de IA à sua conta SIGA Plus.",
      },
      { property: "og:title", content: "Autorizar agente — SIGA Plus" },
      {
        property: "og:description",
        content: "Aprovar o acesso de um assistente de IA à sua conta SIGA Plus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id");
    if (!id) throw new Error("Pedido de autorização em falta.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null; // o ecrã de entrada aparece no lugar desta página
    const { data: details, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = details?.redirect_url ?? details?.redirect_to;
    if (immediate && !details?.client) throw redirect({ href: immediate });
    return details;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8 text-sm">
      Não foi possível carregar este pedido de autorização:{" "}
      {String((error as Error)?.message ?? error)}
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name ?? "um assistente";

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor não devolveu o endereço de regresso.");
      return;
    }
    window.location.href = target;
  }

  if (!details) {
    return (
      <main className="mx-auto max-w-md p-8 text-sm">
        A carregar… recarregue a página após iniciar sessão.
      </main>
    );
  }

  return (
    <main className="mx-auto mt-16 max-w-md space-y-4 rounded-2xl border bg-card p-8 text-card-foreground">
      <h1 className="text-xl font-semibold">Ligar {name} à sua conta</h1>
      <p className="text-sm text-muted-foreground">
        {name} poderá consultar o SIGA Plus em seu nome, apenas com as permissões que já tem.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => decide(true)}>
          Aprovar
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
          Recusar
        </Button>
      </div>
    </main>
  );
}
