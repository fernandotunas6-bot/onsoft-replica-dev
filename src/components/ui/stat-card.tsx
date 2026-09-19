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

const toneStyles: Record<StatCardTone, { iconWrap: string; iconColor: string }> = {
  primary: {
    iconWrap: "bg-primary-soft/80 border-primary/20",
    iconColor: "text-primary",
  },
  success: {
    iconWrap: "bg-emerald-500/10 border-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    iconWrap: "bg-amber-500/10 border-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  info: {
    iconWrap: "bg-sky-500/10 border-sky-500/20",
    iconColor: "text-sky-600 dark:text-sky-400",
  },
  destructive: {
    iconWrap: "bg-destructive/10 border-destructive/20",
    iconColor: "text-destructive",
  },
  neutral: {
    iconWrap: "bg-muted/60 border-border",
    iconColor: "text-muted-foreground",
  },
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
          "relative overflow-hidden rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-card transition-all duration-150",
          to && "hover:border-primary/40 hover:shadow-subtle cursor-pointer",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <div className="flex items-center gap-1.5">
            {action ? <div>{action}</div> : null}
            {Icon ? (
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                  toneConfig.iconWrap,
                )}
              >
                <Icon className={cn("size-4", toneConfig.iconColor)} aria-hidden="true" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {value}
          </div>
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                trend.neutral
                  ? "bg-muted text-muted-foreground"
                  : trend.positive
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
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
