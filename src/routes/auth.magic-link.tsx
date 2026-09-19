import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, LoaderCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAppName } from "@/lib/app-config";

// style-check: route-exempt - fluxo de autenticação por magic link.
export const Route = createFileRoute("/auth/magic-link")({
  head: () => ({
    meta: [{ title: `Entrar · ${getAppName()}` }],
  }),
  component: MagicLinkCallbackPage,
});

/**
 * Landing do link mágico: troca o code/token_hash por uma sessão válida
 * (mesma mecânica de src/routes/auth.reset-password.tsx, mas type "magiclink"
 * e sem formulário — só confirma e redirecciona ao portal).
 */
function MagicLinkCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "success" | "error">("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const resolveSession = async () => {
      if (typeof window === "undefined") return;

      const searchParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;

      const errorParam = searchParams.get("error") || (hash.includes("error=") ? "error" : null);
      if (errorParam) {
        if (!active) return;
        const description = searchParams.get("error_description");
        setErrorMessage(
          description
            ? decodeURIComponent(description.replace(/\+/g, " "))
            : "O link de acesso é inválido ou expirou.",
        );
        setStatus("error");
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setErrorMessage("O link de acesso é inválido ou já foi utilizado.");
          setStatus("error");
          return;
        }
        setStatus("success");
        setTimeout(() => void navigate({ to: "/" }), 1200);
        return;
      }

      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      // O servidor gera o link com type "recovery" (ver magic-link-server.ts —
      // "magiclink" faria o Supabase criar contas para e-mails inexistentes).
      if (tokenHash && (type === "recovery" || type === "magiclink")) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (!active) return;
        if (error) {
          setErrorMessage("O link de acesso é inválido ou expirou.");
          setStatus("error");
          return;
        }
        setStatus("success");
        setTimeout(() => void navigate({ to: "/" }), 1200);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setStatus("success");
        setTimeout(() => void navigate({ to: "/" }), 1200);
      } else {
        setErrorMessage("Nenhum link de acesso válido encontrado.");
        setStatus("error");
      }
    };

    void resolveSession();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-muted/20 p-4 sm:p-6">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border bg-card">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">
              {getAppName()}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              {status === "success"
                ? "Sessão iniciada com sucesso"
                : status === "error"
                  ? "Não foi possível entrar"
                  : "A validar o seu link de acesso…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {status === "checking" && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground text-sm">
                <LoaderCircle className="size-6 animate-spin text-primary" />
                <span>A processar autenticação…</span>
              </div>
            )}
            {status === "success" && (
              <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">
                <ShieldCheck className="size-5 shrink-0 text-success mt-0.5" />
                <p>A redireccionar para o portal…</p>
              </div>
            )}
            {status === "error" && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                  <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Não foi possível continuar</p>
                    <p className="text-xs opacity-90">{errorMessage}</p>
                  </div>
                </div>
                <Button asChild className="w-full">
                  <a href="/">Voltar ao início de sessão</a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
