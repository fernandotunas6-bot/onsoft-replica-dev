import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, AlertTriangle, LoaderCircle, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptSchoolInvitation } from "@/features/access/server";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useAuthSession } from "@/components/auth/AuthGate";

export const Route = createFileRoute("/convite/$token")({
  head: () => ({
    meta: [
      { title: "Aceitar Convite Institucional · SIGA" },
      {
        name: "description",
        content: "Aceitar convite para aceder ao SIGA como membro da escola.",
      },
    ],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const session = useAuthSession();
  const currentUser = useCurrentAccount();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  const isLoggedIn = Boolean(session?.user.id);

  const handleAccept = async () => {
    if (!isLoggedIn) {
      // Redirecionar para login com retorno ao convite
      const returnTo = encodeURIComponent(`/convite/${token}`);
      await navigate({ to: "/alterar-senha", search: { redirect: returnTo } });
      return;
    }

    setStatus("loading");
    try {
      const result = await acceptSchoolInvitation({ data: { token } });
      setSchoolId(result.schoolId);
      setStatus("success");

      // Actualizar o contexto de escola activa
      currentUser.setActiveSchoolId(result.schoolId);

      toast.success("Bem-vindo! O convite foi aceite com sucesso.");

      // Redirecionar para o dashboard após 2s
      setTimeout(() => {
        void navigate({ to: "/" });
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível aceitar o convite.";
      setErrorMsg(msg);
      setStatus("error");
      toast.error(msg);
    }
  };

  // Auto-aceitar se já estiver autenticado e entrar na página
  useEffect(() => {
    if (isLoggedIn && status === "idle" && token) {
      void handleAccept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, token]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg border-border">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
            {status === "success" ? (
              <CheckCircle2 className="size-7 text-emerald-600" />
            ) : status === "error" ? (
              <AlertTriangle className="size-7 text-destructive" />
            ) : (
              <Building2 className="size-7 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl font-bold">
            {status === "success"
              ? "Convite Aceite!"
              : status === "error"
                ? "Não foi possível aceitar"
                : "Convite Institucional"}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            {status === "success"
              ? "Será redirecionado para o painel em breve…"
              : status === "error"
                ? (errorMsg ?? "O convite pode ter expirado ou já ter sido utilizado.")
                : isLoggedIn
                  ? "A processar o seu convite…"
                  : "Inicie sessão para aceitar este convite e aceder ao SIGA."}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-2 space-y-3">
          {status === "loading" && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
              <LoaderCircle className="size-5 animate-spin" />
              <span>A aceitar o convite…</span>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-sm text-muted-foreground text-center">
                Já tem acesso à escola. A aguardar redirecionamento…
              </p>
              <Button asChild className="w-full">
                <Link to="/">Ir para o Painel</Link>
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-xs text-muted-foreground text-center">
                Se acredita que o convite é válido, contacte o administrador da escola para
                solicitar um novo.
              </p>
              <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
                Tentar novamente
              </Button>
              <Button asChild variant="ghost" className="w-full text-xs">
                <Link to="/">Ir para o Painel</Link>
              </Button>
            </div>
          )}

          {!isLoggedIn && status === "idle" && (
            <Button className="w-full mt-2" onClick={() => void handleAccept()}>
              Iniciar Sessão para Aceitar
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
