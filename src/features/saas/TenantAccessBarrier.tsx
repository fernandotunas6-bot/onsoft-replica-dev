import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useTenant } from "@/features/saas/tenant-context";
import type { TenantAccessBlockReason } from "@/features/saas/tenant-access";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { DOC_PATHS, getDocUrl, getPricingUrl } from "@/lib/ecosystem-urls";

const BLOCK_COPY: Record<TenantAccessBlockReason, { title: string; body: string; banner: string }> =
  {
    suspended: {
      title: "Assinatura Suspensa",
      body: "A assinatura encontra-se temporariamente suspensa por razões administrativas.",
      banner: "A assinatura está suspensa: pode consultar os dados, mas não alterá-los.",
    },
    trial_expired: {
      title: "Período de Trial Expirado",
      body: "O período experimental terminou. Escolha um plano para continuar a usar o SIGA Plus.",
      banner:
        "O período experimental terminou: pode consultar e preparar a escola, mas não gravar até escolher um plano.",
    },
    cancelled: {
      title: "Assinatura Cancelada",
      body: "A subscrição desta instituição foi cancelada. Reactive no portal comercial.",
      banner: "A assinatura foi cancelada: pode consultar os dados, mas não alterá-los.",
    },
  };

/**
 * Escola bloqueada (suspensa, cancelada, trial terminado).
 *
 * Até 2026-10-15 o ecrã de bloqueio cobria o SIGA inteiro, para todos —
 * incluindo o administrador, que assim nem chegava a Configurações →
 * Assinatura para pagar. Foi o que deixou sem acesso as escolas registadas no
 * WEB cujo trial de 14 dias terminou antes de o director conseguir entrar.
 *
 * Agora (auditoria 13, A1: «leituras e pagamento da assinatura continuam»):
 * - o Administrador da escola entra em modo de consulta, com um aviso e o
 *   caminho para regularizar. O servidor continua a recusar as gravações
 *   (`assertTenantAllowsWrites`);
 * - os restantes utilizadores e as páginas públicas continuam a ver o bloqueio.
 */
export function TenantAccessBarrier({
  children,
  allowSchoolAdmin = false,
}: {
  children: ReactNode;
  /** Só dentro do AuthGate: fora dele não há conta para reconhecer o administrador. */
  allowSchoolAdmin?: boolean;
}) {
  const { isSuspended, isAdminArea, accessBlockReason, activeTenant } = useTenant();
  const account = useCurrentAccount();

  if (!isSuspended || isAdminArea) return <>{children}</>;

  const copy = BLOCK_COPY[accessBlockReason ?? "suspended"];

  if (allowSchoolAdmin) {
    if (account.profile.isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" aria-label="A verificar o acesso" />
        </div>
      );
    }
    if (account.roles.includes("Administrador")) {
      return (
        <>
          <div
            role="status"
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs text-warning-strong"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>{copy.banner}</span>
            <Link
              to="/configuracoes/assinatura"
              className="font-semibold underline underline-offset-4"
            >
              Regularizar a assinatura
            </Link>
          </div>
          {children}
        </>
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/20 text-warning">
          <AlertTriangle className="h-8 w-8" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy.body} Instituição <strong className="text-foreground">{activeTenant?.name}</strong>.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          O Administrador da escola continua a entrar para regularizar a assinatura. Em caso de
          dúvida, contacte o suporte da plataforma.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={getPricingUrl()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-card"
          >
            Ver planos
          </a>
          <a
            href={getDocUrl(DOC_PATHS.guideSupport)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            Suporte institucional
          </a>
        </div>
      </div>
    </div>
  );
}
