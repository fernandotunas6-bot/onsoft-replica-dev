import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Métricas (§14–§15). No telemóvel a métrica mais importante ocupa a largura
 * toda e as restantes vêm a dois — não seis cartões iguais onde nada se destaca.
 *
 * O cartão é deliberadamente magro: borda, sem sombra. A sombra fica reservada
 * para o que flutua de verdade (§78).
 */
export type MetricTone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

const toneText: Record<MetricTone, string> = {
  primary: "text-primary-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-destructive-strong",
  info: "text-info-strong",
  neutral: "text-foreground",
};

export type Metric = {
  id: string;
  label: string;
  value: React.ReactNode;
  /** Uma linha: a variação, o prazo, o que explica o número. */
  hint?: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  tone?: MetricTone;
  to?: string;
  search?: Record<string, unknown>;
  /** Ocupa a largura toda — reservado para a métrica principal do ecrã. */
  wide?: boolean;
};

export function MetricGrid({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5", className)}>
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </div>
  );
}

export function MetricCard({ metric }: { metric: Metric }) {
  const tone = metric.tone ?? "neutral";
  const content = (
    <div
      className={cn(
        "flex h-full flex-col justify-between rounded-xl border border-border bg-card p-3.5",
        metric.to && "motion-safe:transition-colors motion-safe:duration-150 active:bg-secondary/60",
      )}
    >
      <p className="text-[11px] font-medium text-muted-foreground">{metric.label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span
          className={cn(
            "tnum text-2xl leading-none tracking-tight",
            metric.wide && "text-[1.75rem]",
            toneText[tone],
          )}
        >
          {metric.value}
        </span>
        {metric.trend ? <TrendPill trend={metric.trend} /> : null}
      </div>
      {metric.hint ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{metric.hint}</p>
      ) : null}
    </div>
  );

  const wrapper = metric.wide ? "col-span-2" : "";

  if (metric.to) {
    return (
      <Link
        to={metric.to}
        search={metric.search as never}
        className={cn("block rounded-xl outline-none focus-visible:ring-2", wrapper)}
      >
        {content}
      </Link>
    );
  }
  return <div className={wrapper}>{content}</div>;
}

function TrendPill({ trend }: { trend: NonNullable<Metric["trend"]> }) {
  const Icon =
    trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        trend.direction === "flat"
          ? "bg-muted text-muted-foreground"
          : trend.direction === "up"
            ? "bg-success/10 text-success-strong"
            : "bg-destructive/10 text-destructive-strong",
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="tnum">{trend.value}</span>
    </span>
  );
}
