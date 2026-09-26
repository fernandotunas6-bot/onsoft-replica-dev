/**
 * Peças comuns dos portais do Aluno, do Encarregado e do Professor.
 *
 * Um só vocabulário visual: superfícies neutras, uma cor de destaque (a
 * primária, em tom suave), ícones em cinza e cor forte só onde pede atenção
 * (uma falta). Os portais compõem estas peças em vez de repetirem cartões com
 * bordas e badges de cores diferentes.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { InlineLoading } from "@/components/ui/inline-loading";
import { cn } from "@/lib/utils";

export function PortalHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p className="text-xs text-muted-foreground">{eyebrow}</p>
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PortalStats({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return (
    <div
      className={cn("grid gap-3 grid-cols-2", columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}
    >
      {children}
    </div>
  );
}

export function PortalStat({
  label,
  icon: Icon,
  value,
  hint,
  loading,
  loadingLabel = "A carregar…",
  attention,
}: {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  /** Pede atenção (ex.: média negativa, chamadas por fazer): só o texto de apoio muda. */
  attention?: boolean;
}) {
  return (
    <div className="surface-card p-4 space-y-1.5 min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </p>
      {loading ? (
        <InlineLoading label={loadingLabel} />
      ) : (
        <>
          <div className="text-lg font-medium text-foreground tabular-nums leading-tight truncate">
            {value}
          </div>
          {hint ? (
            <p
              className={cn(
                "text-xs leading-snug",
                attention ? "text-destructive/80" : "text-muted-foreground",
              )}
            >
              {hint}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

type PortalLinkTarget = { to: string; search?: Record<string, unknown> };

export function PortalSection({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  action?: PortalLinkTarget & { label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-card p-5 space-y-3 min-w-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
          {title}
        </h2>
        {action ? (
          <Link
            to={action.to as never}
            search={action.search as never}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {action.label}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PortalEmpty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-xs text-muted-foreground">{children}</p>;
}

export function PortalLoading({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-4">
      <InlineLoading label={label} />
    </div>
  );
}

export type PortalQuickLink = PortalLinkTarget & { label: string; icon: LucideIcon };

/** Atalhos compactos: uma linha de ligações, sem mosaicos coloridos. */
export function PortalQuickLinks({ items }: { items: PortalQuickLink[] }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.label}>
          <Link
            to={item.to as never}
            search={item.search as never}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-muted"
          >
            <item.icon className="size-4 text-muted-foreground shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const ATTENDANCE_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  present: { label: "Presente", dot: "bg-success/70", text: "text-muted-foreground" },
  absent: { label: "Falta", dot: "bg-destructive", text: "text-destructive/90" },
  excused: { label: "Justificada", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  late: { label: "Atraso", dot: "bg-warning", text: "text-muted-foreground" },
};

export function AttendanceStatus({ status }: { status: string }) {
  const meta = ATTENDANCE_STATUS[status] ?? {
    label: status,
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", meta.text)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

/** Linha de uma lista simples (presenças, avisos): separadores finos, sem caixas. */
export function PortalListItem({
  title,
  meta,
  aside,
}: {
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-foreground truncate">{title}</p>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
    </li>
  );
}

export function PortalList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border">{children}</ul>;
}
