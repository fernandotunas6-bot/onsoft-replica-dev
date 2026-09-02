import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type RouteErrorScreenProps = {
  error: Error;
  reset: () => void;
  fullPage?: boolean;
};

/** Ecrã de erro em português. `fullPage` cobre falhas da raiz; o modo compacto fica no conteúdo da rota. */
export function RouteErrorScreen({ error, reset, fullPage = false }: RouteErrorScreenProps) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: fullPage ? "siga_root" : "siga_route" });
  }, [error, fullPage]);

  return (
    <div
      className={
        fullPage
          ? "flex min-h-screen items-center justify-center bg-background px-4"
          : "flex min-h-[50vh] items-center justify-center px-4 py-10"
      }
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo correu mal do nosso lado. Pode tentar outra vez ou voltar ao início.
        </p>
        {error?.message ? (
          <details className="mt-3 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Detalhes técnicos
            </summary>
            <p className="mt-1 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
              {error.message}
            </p>
          </details>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar outra vez
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}
