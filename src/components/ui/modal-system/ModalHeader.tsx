import * as React from "react";
import { X, HelpCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalHeaderProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  onHelp?: () => void;
  badge?: React.ReactNode;
  className?: string;
}

export function ModalHeader({
  icon: Icon,
  title,
  subtitle,
  onClose,
  onHelp,
  badge,
  className,
}: ModalHeaderProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-5 py-3.5",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0 pr-2">
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-xs">
            <Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm tracking-tight text-foreground truncate">
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onHelp && (
          <button
            type="button"
            onClick={onHelp}
            title="Ajuda contextual"
            aria-label="Ajuda contextual"
            className="flex size-8 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0 lg:min-w-0"
          >
            <HelpCircle className="size-4" />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Fechar (Esc)"
            aria-label="Fechar"
            className="flex size-8 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0 lg:min-w-0"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
