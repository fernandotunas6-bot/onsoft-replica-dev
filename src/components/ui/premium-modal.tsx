import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Modal premium reutilizável: cabeçalho com gradiente, ícone em destaque,
 * corpo com scroll e barra de acções fixa.
 */
export function PremiumModal({
  open,
  onOpenChange,
  eyebrow,
  title,
  description,
  icon,
  footer,
  children,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  icon?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full" | undefined;
}) {
  const width =
    size === "full"
      ? "h-[calc(100dvh-2rem)] sm:h-[96dvh] sm:max-w-[98vw]"
      : size === "xl"
        ? "sm:max-w-6xl"
        : size === "lg"
          ? "sm:max-w-3xl"
          : size === "sm"
            ? "sm:max-w-md"
            : "sm:max-w-xl";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden border-border/70 p-0 shadow-2xl sm:rounded-2xl",
          width,
        )}
      >
        <div className="relative shrink-0 overflow-hidden border-b border-border/70 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent bg-background/75 px-4 py-4 backdrop-blur-xl sm:px-6 sm:py-5">
          <span className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex min-w-0 items-start gap-3 sm:gap-4">
            {icon ? (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? <p className="text-[11px] font-semibold text-primary">{eyebrow}</p> : null}
              <DialogTitle className="break-words font-display text-lg font-extrabold leading-snug tracking-tight sm:text-xl">
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription className="mt-1 text-sm">{description}</DialogDescription>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-secondary/40 px-4 py-3 sm:px-6 sm:py-4">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
