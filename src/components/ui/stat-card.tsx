import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCardTone = "primary" | "success" | "warning" | "info" | "destructive" | "neutral";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon?: React.ElementType;
  tone?: StatCardTone;
  trend?: {
    value: string;
    positive?: boolean;
    neutral?: boolean;
  };
  to?: string;
  search?: Record<string, unknown>;
  action?: React.ReactNode;
}

/*
 * Indicadores discretos: o ícone é só uma pista, em cinza; a cor fica para quando o
 * número pede atenção (dívida, alertas). Tokens do tema, não cores Tailwind cruas.
 */
const toneStyles: Record<StatCardTone, { iconColor: string }> = {
  primary: { iconColor: "text-muted-foreground/70" },
  success: { iconColor: "text-muted-foreground/70" },
  info: { iconColor: "text-muted-foreground/70" },
  neutral: { iconColor: "text-muted-foreground/70" },
  warning: { iconColor: "text-warning-strong" },
  destructive: { iconColor: "text-destructive-strong" },
};

export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      title,
      value,
      subtitle,
      icon: Icon,
      tone = "primary",
      trend,
      to,
      search,
      action,
      className,
      ...props
    },
    ref,
  ) => {
    const toneConfig = toneStyles[tone];

    const content = (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/80 bg-card p-4 shadow-card transition-colors duration-150 sm:p-5",
          to && "cursor-pointer hover:border-foreground/20",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground">{title}</span>
          <div className="flex items-center gap-1.5">
            {action ? <div>{action}</div> : null}
            {Icon ? (
              <Icon className={cn("size-4 shrink-0", toneConfig.iconColor)} aria-hidden="true" />
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
            {value}
          </div>
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                trend.neutral
                  ? "bg-muted text-muted-foreground"
                  : trend.positive
                    ? "bg-success/10 text-success-strong"
                    : "bg-destructive/10 text-destructive-strong",
              )}
            >
              {trend.neutral ? (
                <Minus className="size-3" aria-hidden="true" />
              ) : trend.positive ? (
                <ArrowUpRight className="size-3" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="size-3" aria-hidden="true" />
              )}
              <span>{trend.value}</span>
            </span>
          ) : null}
        </div>

        {subtitle ? (
          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    );

    if (to) {
      return (
        <div ref={ref} {...props}>
          <Link
            to={to}
            search={search}
            className="block group outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl"
          >
            {content}
          </Link>
        </div>
      );
    }

    return (
      <div ref={ref} {...props}>
        {content}
      </div>
    );
  },
);

StatCard.displayName = "StatCard";
