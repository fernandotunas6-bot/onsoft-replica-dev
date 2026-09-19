import { cn } from "@/lib/utils";
import { formatCompactCurrency, formatCurrency } from "@/lib/formatters";

export function Money({
  amountMinor,
  currency = "AOA",
  locale = "pt-AO",
  compact = false,
  className,
}: {
  amountMinor: number;
  currency?: string;
  locale?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {compact
        ? formatCompactCurrency(amountMinor, currency, locale)
        : formatCurrency(amountMinor, currency, locale)}
    </span>
  );
}
