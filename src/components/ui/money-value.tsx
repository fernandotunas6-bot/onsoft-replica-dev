import * as React from "react";
import { cn } from "@/lib/utils";
import { kwanza } from "@/lib/currency";

/**
 * Valor monetário (§40). Um único componente para todo o SIGA, por três razões:
 *
 * 1. `tabular-nums` — sem isto, uma coluna de valores fica desalinhada porque
 *    o "1" do Inter é mais estreito do que o "8". Numa lista de propinas isso
 *    lê-se como erro de formatação.
 * 2. O sinal e o tom são decisão do componente, não de cada ecrã: um valor
 *    em dívida é vermelho em toda a aplicação ou em nenhuma.
 * 3. `aria-label` com o valor lido por extenso — "35.000 Kz" soa a "trinta e
 *    cinco mil Kz" e não a "35 ponto 000".
 */
export type MoneyTone = "default" | "muted" | "positive" | "negative" | "warning";

const toneClasses: Record<MoneyTone, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  positive: "text-success-strong",
  negative: "text-destructive-strong",
  warning: "text-warning-strong",
};

export interface MoneyValueProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  amount: number | null | undefined;
  tone?: MoneyTone;
  /** Mostra `+`/`−` explícito — usado em movimentos de caixa. */
  signed?: boolean;
  /** Texto quando não há valor (ainda a carregar, ou campo vazio). */
  emptyLabel?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-2xl tracking-tight",
} as const;

export function MoneyValue({
  amount,
  tone = "default",
  signed = false,
  emptyLabel = "—",
  size = "md",
  className,
  ...props
}: MoneyValueProps) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return (
      <span className={cn("tnum text-muted-foreground", sizeClasses[size], className)} {...props}>
        {emptyLabel}
      </span>
    );
  }

  const formatted = kwanza(Math.abs(amount));
  const sign = amount < 0 ? "−" : signed && amount > 0 ? "+" : "";

  return (
    <span
      className={cn("tnum whitespace-nowrap", toneClasses[tone], sizeClasses[size], className)}
      {...props}
    >
      {sign}
      {formatted}
    </span>
  );
}
