import * as React from "react";
import { X, HelpCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalHeaderProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  closeDisabled?: boolean;
  onHelp?: () => void;
  badge?: React.ReactNode;
  className?: string;
}

export function ModalHeader({
  icon: Icon,
  title,
  subtitle,
  onClose,
  closeDisabled = false,
  onHelp,
  badge,
  className,
}: ModalHeaderProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start justify-between border-b border-border bg-card px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 pr-2">
        {Icon && (
          <div className="flex size-[36px] shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-xs">
            <Icon className="size-[20px] text-primary-strong" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-[18px] font-semibold leading-[24px] text-foreground">
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-1.5 break-words text-[13px] leading-[20px] text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onHelp && (
          <button
            type="button"
            onClick={onHelp}
            title="Ajuda contextual"
            aria-label="Ajuda contextual"
            className="flex size-[44px] min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HelpCircle className="size-[18px]" />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            title="Fechar (Esc)"
            aria-label="Fechar"
            className="disabled:cursor-not-allowed disabled:opacity-50 flex size-[44px] min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}
