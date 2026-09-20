import {
  Activity,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PaymentStatus } from "@/lib/payflow";

const statusPresentation: Record<
  PaymentStatus,
  { label: string; className: string; icon: typeof Activity }
> = {
  paid: {
    label: "Pago",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  pending: {
    label: "Pendente",
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    icon: Clock3,
  },
  failed: {
    label: "Falhou",
    className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    icon: Activity,
  },
  refunded: {
    label: "Reembolsado",
    className: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    icon: RefreshCw,
  },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const presentation = statusPresentation[status];
  const Icon = presentation.icon;

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 font-medium ${presentation.className}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {presentation.label}
    </Badge>
  );
}
