import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  type FinancialStatus,
  FINANCIAL_STATUS_LABELS,
  formatKz,
} from "@/features/students/academic-status";
import { AlertCircle } from "lucide-react";

export interface StudentFinanceBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: FinancialStatus | string | null | undefined;
  debtAmount?: number | null;
  overdueCount?: number | null;
  showAmount?: boolean;
  size?: "sm" | "md" | "lg";
}

const financeTones: Record<FinancialStatus, string> = {
  settled: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25",
  pending: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/25",
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
  partial: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border border-sky-500/25",
};

export function StudentFinanceBadge({
  status,
  debtAmount,
  overdueCount,
  showAmount = true,
  size = "md",
  className,
  ...props
}: StudentFinanceBadgeProps) {
  if (!status) return null;

  const normStatus = (status in FINANCIAL_STATUS_LABELS ? status : "pending") as FinancialStatus;
  const baseLabel = FINANCIAL_STATUS_LABELS[normStatus] ?? status;
  const tone = financeTones[normStatus] ?? financeTones.pending;

  let displayLabel = baseLabel;
  if (normStatus === "overdue") {
    if (showAmount && debtAmount && debtAmount > 0) {
      displayLabel = `Dívida: ${formatKz(debtAmount)}`;
    } else if (overdueCount && overdueCount > 0) {
      displayLabel = `${overdueCount} ${overdueCount === 1 ? "fatura em atraso" : "faturas em atraso"}`;
    }
  }

  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5 gap-1",
    md: "text-[11px] px-2.5 py-0.5 gap-1.5",
    lg: "text-xs px-3 py-1 gap-2",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold transition-colors shrink-0",
        sizeClasses,
        tone,
        className,
      )}
      title={
        normStatus === "overdue" && debtAmount
          ? `Valor em dívida: ${formatKz(debtAmount)}${overdueCount ? ` (${overdueCount} fatura(s))` : ""}`
          : undefined
      }
      {...props}
    >
      {normStatus === "overdue" ? (
        <AlertCircle className="size-3 text-rose-600 dark:text-rose-400 shrink-0" />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full shrink-0",
            normStatus === "settled"
              ? "bg-emerald-500"
              : normStatus === "partial"
                ? "bg-sky-500"
                : "bg-amber-500",
          )}
          aria-hidden="true"
        />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
