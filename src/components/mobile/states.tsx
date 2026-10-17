import * as React from "react";
import { AlertTriangle, RefreshCw, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Estados vazios e de erro (§44–§45).
 *
 * "Nenhum resultado." não ajuda ninguém: não diz porque está vazio nem o que
 * fazer a seguir. Estes dois componentes obrigam a dar sempre uma saída — é a
 * regra do "zero dead end" (§83).
 *
 * O erro nunca mostra a mensagem técnica ao utilizador. O detalhe vai para a
 * consola e para o `error-capture`; no ecrã fica a frase em português e o botão
 * de tentar outra vez.
 */
export function MobileEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon = SearchX,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button type="button" className="mt-4 h-10" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function MobileErrorState({
  what = "os dados",
  onRetry,
  /** Detalhe técnico — vai para a consola, não para o ecrã. */
  error,
}: {
  what?: string;
  onRetry?: () => void;
  error?: unknown;
}) {
  React.useEffect(() => {
    if (error) console.error("[SIGA] falha ao carregar", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive-strong">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">Não foi possível carregar {what}.</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        Verifique a ligação. Se continuar, a escola pode estar sem acesso a este módulo.
      </p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-4 h-10 gap-2" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden /> Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
