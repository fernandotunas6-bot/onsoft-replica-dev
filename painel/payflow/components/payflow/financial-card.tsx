import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

const tones = {
  brand: "bg-primary/8 text-primary dark:bg-emerald-950/60 dark:text-emerald-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-800 dark:bg-amber-950/55 dark:text-amber-300",
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-950/55 dark:text-rose-300",
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
} as const;

export function FinancialCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  description: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
}) {
  return (
    <Card className="gap-0 border-border/90 py-0 shadow-[var(--shadow-soft)]">
      <CardContent className="px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-4 text-[1.65rem] font-semibold leading-none tracking-[-0.035em] text-foreground">
          {value}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
