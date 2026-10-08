import { Fragment, useState, type ElementType, type ReactNode } from "react";
import { MoreInfo } from "@/components/ui/more-info";
import { splitDescription } from "@/lib/split-description";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import type { ChipTone } from "@/components/ui/icon-chip";
import { IconChip } from "@/components/ui/icon-chip";
import { LazyVisible } from "@/components/ui/lazy-visible";
import { LogoChip } from "@/components/ui/logo-chip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export type PageCrumb = {
  label: string;
  to?: string;
  search?: Record<string, string | undefined>;
};

function ShortDescription({ text, className }: { text: string; className?: string }) {
  const { lead, rest } = splitDescription(text);
  return (
    <div className={className}>
      <p>{lead}</p>
      {rest ? <MoreInfo className="mt-0.5">{rest}</MoreInfo> : null}
    </div>
  );
}

export function PageHeader({
  group,
  title,
  description,
  actions,
  avatar,
  icon,
  logoUrl,
  crumbs,
  hideBreadcrumb = false,
}: {
  group: string;
  title: string;
  description: string;
  actions?: ReactNode;
  avatar?: ReactNode;
  icon?: ElementType;
  logoUrl?: string | null;
  crumbs?: PageCrumb[];
  hideBreadcrumb?: boolean;
}) {
  const headerMark =
    avatar ??
    (logoUrl?.trim() ? (
      <LogoChip src={logoUrl.trim()} size="lg" label={title} />
    ) : icon ? (
      <IconChip icon={icon} size="lg" label={title} />
    ) : null);

  const trail: PageCrumb[] =
    crumbs ??
    ([{ label: "Início", to: "/" }, { label: group }, { label: title }] satisfies PageCrumb[]);

  return (
    <div className="relative isolate space-y-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      {/* Brilho na cor da área (tom em <html data-tone>, ver AreaToneSync). */}
      <div aria-hidden="true" className="page-header-glow" />
      {!hideBreadcrumb ? (
        <Breadcrumb className="relative">
          <BreadcrumbList className="text-[11px] sm:text-xs">
            {trail.map((crumb, index) => {
              const isLast = index === trail.length - 1;
              // O separador é `<li>`: tem de ser irmão do item, não filho —
              // `<li>` dentro de `<li>` é HTML inválido e rebentava a
              // hidratação em todas as páginas com cabeçalho.
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? <BreadcrumbSeparator className="[&>svg]:size-3" /> : null}
                  <BreadcrumbItem className="gap-1.5">
                    {isLast || !crumb.to ? (
                      <BreadcrumbPage className={cn(!isLast && "text-muted-foreground")}>
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.to} search={crumb.search}>
                          {crumb.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {headerMark}
          <div>
            {/* O grupo já aparece no caminho de navegação; repeti-lo em
                maiúsculas por cima do título era ruído. */}
            {hideBreadcrumb ? (
              <p className="text-xs font-medium text-muted-foreground">{group}</p>
            ) : null}
            <h1 className="font-display text-lg font-semibold tracking-tight md:text-xl">
              {title}
            </h1>
            <ShortDescription
              text={description}
              className="mt-0.5 max-w-2xl text-xs text-muted-foreground md:text-sm"
            />
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatGrid({
  items,
  children,
  collapsible = false,
  storageKey,
}: {
  items?: {
    label: string;
    value: string;
    hint?: string;
    icon?: ElementType;
    tone?: ChipTone;
  }[];
  children?: ReactNode;
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
      } catch {
        /* localStorage indisponível (privado/desactivado) — ignorar. */
      }
    }
    return false;
  });

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    if (lsKey) {
      try {
        localStorage.setItem(lsKey, String(next));
      } catch {
        /* localStorage indisponível (privado/desactivado) — ignorar. */
      }
    }
  };

  const grid = children ? (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  ) : items && items.length > 0 ? (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const tone = item.tone ?? "primary";
        return (
          <div
            key={item.label}
            className="hover-lift group relative overflow-hidden rounded-xl border border-border/80 bg-card p-3.5 shadow-card hover:border-primary/30"
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
              {item.icon ? (
                <IconChip
                  icon={item.icon}
                  tone={tone}
                  size="sm"
                  label={item.label}
                  className="transition-transform duration-150 group-hover:scale-105"
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  ) : null;

  if (!grid) return null;
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
        <div className="overflow-hidden">{grid}</div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  icon,
  logoUrl,
  tone,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ElementType;
  logoUrl?: string | null;
  tone?: ChipTone;
  children: ReactNode;
}) {
  const panelMark = logoUrl?.trim() ? (
    <LogoChip src={logoUrl.trim()} tone={tone ?? "primary"} size="sm" label={title} />
  ) : icon ? (
    <IconChip icon={icon} tone={tone ?? "primary"} size="sm" label={title} />
  ) : null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card transition-shadow hover:shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {panelMark}
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold tracking-tight sm:text-base">
              {title}
            </h2>
            {description ? (
              <ShortDescription
                text={description}
                className="text-[11px] text-muted-foreground sm:text-xs"
              />
            ) : null}
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
