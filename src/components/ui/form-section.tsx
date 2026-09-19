import * as React from "react";
import { cn } from "@/lib/utils";

export interface FormSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: React.ReactNode;
  columns?: 1 | 2 | 3;
  children: React.ReactNode;
}

export const FormSection = React.forwardRef<HTMLDivElement, FormSectionProps>(
  ({ title, description, action, columns = 2, children, className, ...props }, ref) => {
    const gridCols =
      columns === 1
        ? "grid-cols-1"
        : columns === 2
          ? "grid-cols-1 md:grid-cols-2"
          : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

    return (
      <section
        ref={ref}
        className={cn(
          "rounded-xl border border-border/80 bg-card p-4 sm:p-6 shadow-card transition-all",
          className,
        )}
        {...props}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-3 sm:pb-4 mb-4 sm:mb-5">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
              {title}
            </h3>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground max-w-xl">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <div className={cn("grid gap-4", gridCols)}>{children}</div>
      </section>
    );
  },
);

FormSection.displayName = "FormSection";
