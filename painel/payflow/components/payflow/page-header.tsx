import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  context,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-sm font-medium text-primary">{eyebrow}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.035em] text-foreground sm:text-[2rem]">
            {title}
          </h1>
          {context}
        </div>
        {description ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </section>
  );
}
