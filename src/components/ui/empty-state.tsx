import type { ElementType, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SigaMascot } from "@/components/brand/aurora";

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ElementType;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  compact?: boolean;
  /**
   * Primeiro uso («Ainda não há…»): a mascote convida a começar. Só nestes
   * casos — num filtro sem resultados seria ruído.
   */
  firstUse?: boolean;
};

/**
 * Estado vazio educativo — explica o que falta e oferece a próxima acção.
 * Preferir a mensagens genéricas «Nenhum dado encontrado».
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  actionLabel,
  onAction,
  className,
  compact = false,
  firstUse = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-col items-center justify-center text-center",
        compact ? "px-4 py-6" : "px-6 py-8",
        className,
      )}
      role="status"
    >
      {firstUse && !compact ? (
        <span className="relative mb-4 block size-16" aria-hidden>
          <SigaMascot size={64} tilt={-6} className="left-0 top-0" />
        </span>
      ) : (
        <span
          className={cn(
            "mb-3 flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
            compact ? "size-10" : "size-11",
          )}
          aria-hidden
        >
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
      )}
      <h3 className="max-w-full text-[14px] font-semibold text-foreground [overflow-wrap:anywhere]">
        {title}
      </h3>
      {description?.trim() ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-4 min-w-0 max-w-full">{action}</div>
      ) : actionLabel && onAction ? (
        <Button
          type="button"
          size="sm"
          className="mt-4 h-auto min-h-9 max-w-full whitespace-normal break-words py-2"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
