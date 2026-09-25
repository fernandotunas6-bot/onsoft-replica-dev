import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canAccessPath } from "@/features/auth/access-policy";
import { PageLoading } from "@/components/ui/page-loading";
import { InstitutionOnboarding } from "@/components/auth/InstitutionOnboarding";

export function RouteAccessGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const account = useCurrentAccount();

  if (!account.id || account.profile.isPending) {
    return <PageLoading message="A confirmar acesso…" />;
  }

  if (account.profile.isError && pathname !== "/alterar-senha") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
          <ShieldAlert className="mx-auto size-10 text-destructive" />
          <h1 className="mt-4 font-display text-2xl font-extrabold">Perfil indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Não foi possível confirmar o seu papel na escola. Actualize a página ou volte a iniciar
            sessão.
          </p>
          <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
            {account.profile.error instanceof Error
              ? account.profile.error.message
              : "Erro desconhecido ao carregar o perfil."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              onClick={() => void account.profile.refetch()}
            >
              Tentar novamente
            </button>
            <Link
              to="/alterar-senha"
              className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground"
            >
              Alterar senha
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Identidade autenticada sem nenhum vínculo activo: não há painel a abrir.
  // Em vez de "acesso não autorizado", oferece criar escola ou pedir acesso.
  if (account.profile.data && !account.profile.data.school_id && pathname !== "/alterar-senha") {
    return <InstitutionOnboarding displayName={account.name} />;
  }

  const missingProfile = !account.profile.data && pathname !== "/alterar-senha";
  const denied = missingProfile || !canAccessPath(pathname, account.role, account.grants);
  if (denied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
          <ShieldAlert className="mx-auto size-10 text-destructive" />
          <h1 className="mt-4 font-display text-2xl font-extrabold">Acesso não autorizado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O perfil <strong>{account.role}</strong> não tem permissão para{" "}
            <strong>{pathname}</strong>. Contacte a administração da escola se precisar de acesso.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              to="/"
              className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Voltar ao início
            </Link>
            <Link
              to="/alterar-senha"
              className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground"
            >
              Alterar senha
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return children;
}
