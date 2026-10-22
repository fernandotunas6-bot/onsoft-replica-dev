import * as React from "react";
import { cn } from "@/lib/utils";

export interface DataTableShellProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const DataTableShell = React.forwardRef<HTMLDivElement, DataTableShellProps>(
  ({ header, footer, children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "overflow-hidden rounded-xl border border-border/80 bg-card shadow-card transition-[border-color,background-color] duration-(--siga-motion-fast) motion-reduce:transition-none",
          className,
        )}
        {...props}
      >
        {header ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-3.5 py-3 sm:px-4">
            {header}
          </div>
        ) : null}

        <div
          role="region"
          aria-label="Tabela com deslocação horizontal"
          tabIndex={0}
          className="relative w-full max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {children}
        </div>

        {footer ? (
          <div className="border-t border-border/60 bg-muted/10 px-3.5 py-2.5 sm:px-4">
            {footer}
          </div>
        ) : null}
      </div>
    );
  },
);

DataTableShell.displayName = "DataTableShell";
