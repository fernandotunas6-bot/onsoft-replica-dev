import type { ElementType, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ElementType;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  compact?: boolean;
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
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/20 text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
      role="status"
    >
      <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-xs text-muted-foreground md:text-sm">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-4">{action}</div>
      ) : actionLabel && onAction ? (
        <Button type="button" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
