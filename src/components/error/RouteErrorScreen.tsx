import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { handleSessionExpired, isSessionError } from "@/lib/session-expiry";
import { STALE_BUILD_MESSAGE, isStaleBuildError, recoverFromStaleBuild } from "@/lib/stale-build";
import { guidanceFor } from "@/lib/error-guidance";
import { isTechnicalMessage } from "@/lib/public-error";
import { describeError, runGuidanceAction } from "@/lib/toast";

type RouteErrorScreenProps = {
  error: Error;
  reset: () => void;
  fullPage?: boolean;
};

/** Ecrã de erro em português. `fullPage` cobre falhas da raiz; o modo compacto fica no conteúdo da rota. */
export function RouteErrorScreen({ error, reset, fullPage = false }: RouteErrorScreenProps) {
  const router = useRouter();
  const sessionExpired = isSessionError(error);
  const staleBuild = !sessionExpired && isStaleBuildError(error);
  useEffect(() => {
    if (sessionExpired) {
      handleSessionExpired();
      return;
    }
    if (staleBuild && recoverFromStaleBuild(error)) return;
    console.error(error);
    reportLovableError(error, { boundary: fullPage ? "siga_root" : "siga_route" });
  }, [error, fullPage, sessionExpired, staleBuild]);

  if (staleBuild) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10" role="status">
        <p className="text-sm text-muted-foreground">{STALE_BUILD_MESSAGE}</p>
      </div>
    );
  }

  if (sessionExpired) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10" role="status">
        <p className="text-sm text-muted-foreground">
          A sua sessão expirou. A abrir o ecrã de entrada…
        </p>
      </div>
    );
  }

  // Uma página que não carrega por falta de configuração (ou de permissão)
  // diz porquê e leva ao sítio certo, em vez de «algo correu mal».
  const guidance = guidanceFor(error);
  const message = error?.message?.trim() ?? "";
  // `describeError` aplica as permissões: o botão só aparece a quem o pode abrir.
  const described = guidance && message ? describeError(message) : null;
  const heading = guidance
    ? (described?.title ?? guidance.title ?? "Esta página não carregou")
    : "Esta página não carregou";
  const explanation = guidance
    ? (described?.description ?? guidance.fix)
    : "Algo correu mal do nosso lado. Pode tentar outra vez ou voltar ao início.";
  const action = described?.action;
  const showDetails = Boolean(message) && (!guidance || isTechnicalMessage(message));

  return (
    <div
      className={
        fullPage
          ? "flex min-h-screen items-center justify-center bg-background px-4"
          : "flex min-h-[50vh] items-center justify-center px-4 py-10"
      }
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{heading}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{explanation}</p>
        {showDetails ? (
          <details className="mt-3 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Detalhes técnicos:
            </summary>
            <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
              {error.message}
            </p>
          </details>
        ) : null}
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row sm:flex-wrap">
          {action ? (
            <button
              type="button"
              onClick={() => runGuidanceAction(action)}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {action.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className={
              action
                ? "inline-flex min-h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                : "inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            }
          >
            Tentar outra vez
          </button>
          <a
            href="/"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}
