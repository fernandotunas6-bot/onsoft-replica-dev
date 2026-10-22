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
    iconWrap: "bg-success/10 border-success/20",
    iconColor: "text-success-strong",
  },
  warning: {
    iconWrap: "bg-warning/10 border-warning/20",
    iconColor: "text-warning-strong",
  },
  info: {
    iconWrap: "bg-info/10 border-info/20",
    iconColor: "text-info-strong",
  },
  destructive: {
    iconWrap: "bg-destructive/10 border-destructive/20",
    iconColor: "text-destructive-strong",
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
      tone = "neutral",
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
          "relative overflow-hidden rounded-xl border border-border/80 bg-card p-4 sm:p-5 transition-colors duration-(--siga-motion-fast) ease-(--siga-ease) motion-reduce:transition-none",
          to && "hover:border-primary/40 cursor-pointer",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-words text-xs font-medium text-muted-foreground">
            {title}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {action ? <div>{action}</div> : null}
            {Icon ? (
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                  toneConfig.iconWrap,
                )}
              >
                <Icon
                  className={cn("size-4", toneConfig.iconColor)}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0 break-words font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
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
