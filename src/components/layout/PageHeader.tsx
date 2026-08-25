import { useState, type ElementType, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { IconChip, type ChipTone } from "@/components/ui/icon-chip";
import { LazyVisible } from "@/components/ui/lazy-visible";
import { inferIcon } from "@/lib/auto-icon";
import { cn } from "@/lib/utils";

export function PageHeader({
  group,
  title,
  description,
  actions,
  avatar,
}: {
  group: string;
  title: string;
  description: string;
  actions?: ReactNode;
  avatar?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {avatar}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {group}
          </p>
          <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">
            {title}
          </h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground md:text-sm">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatGrid({
  items,
  collapsible = false,
  storageKey,
}: {
  items: {
    label: string;
    value: string;
    hint?: string;
    icon?: ElementType;
    tone?: ChipTone;
  }[];
  collapsible?: boolean;
  storageKey?: string;
}) {
  const lsKey = collapsible && storageKey ? `siga:stats-${storageKey}` : null;

  const [visible, setVisible] = useState<boolean>(() => {
    if (!collapsible) return true;
    if (lsKey && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(lsKey);
        if (stored !== null) return stored === "true";
      } catch {}
    }
    return false; // oculto por defeito
  });

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    if (lsKey) {
      try {
        localStorage.setItem(lsKey, String(next));
      } catch {}
    }
  };

  const grid = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const inferred = inferIcon(`${item.label} ${item.hint ?? ""}`);
        const Icon = item.icon ?? inferred.icon;
        const tone = item.tone ?? inferred.tone;
        return (
          <div
            key={item.label}
            className="group relative overflow-hidden rounded-lg border border-border/80 bg-card p-3.5 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
          >
            <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 to-primary/0 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-display text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
                  {item.value}
                </p>
                {item.hint ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</p>
                ) : null}
              </div>
              <IconChip
                icon={Icon}
                tone={tone}
                size="sm"
                className="transition-transform duration-150 group-hover:scale-105"
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  if (!collapsible) return grid;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={visible}
          aria-label={visible ? "Ocultar estatísticas" : "Ver estatísticas"}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              visible ? "rotate-0" : "-rotate-90",
            )}
          />
          {visible ? "Ocultar" : "Ver estatísticas"}
        </button>
      </div>
      <div
        aria-hidden={!visible}
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none",
        )}
      >
        <div className="overflow-hidden">
          {grid}
        </div>
      </div>
    </div>
  );
}


export function Panel({
  title,
  description,
  action,
  icon,
  tone,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ElementType;
  tone?: ChipTone;
  children: ReactNode;
}) {
  const inferred = inferIcon(`${title} ${description ?? ""}`);
  const Icon = icon ?? inferred.icon;
  const chipTone = tone ?? inferred.tone;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconChip icon={Icon} tone={chipTone} size="sm" />
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold tracking-tight sm:text-base">{title}</h2>
            {description ? <p className="text-[11px] text-muted-foreground sm:text-xs">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-4.5">
        <LazyVisible minHeight={160} rootMargin="320px">
          {children}
        </LazyVisible>
      </div>
    </section>
  );
}

export const badgeBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

export const toneClass = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning-foreground",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-info/10 text-info-strong",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary-strong",
} satisfies Record<string, string>;
