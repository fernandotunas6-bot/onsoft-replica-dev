import type { ReactNode } from "react";

export function PageHeader({
  group,
  title,
  description,
  actions,
}: {
  group: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {group}
        </p>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatGrid({
  items,
}: {
  items: { label: string; value: string; hint?: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">{item.value}</p>
          {item.hint ? <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export const badgeBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

export const toneClass = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning-foreground",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-info/10 text-info",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
} satisfies Record<string, string>;
