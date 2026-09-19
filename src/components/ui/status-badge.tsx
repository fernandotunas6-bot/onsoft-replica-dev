import * as React from "react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RotateCcw,
  RefreshCw,
  UserCheck,
  UserX,
  UserPlus,
  CircleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SystemStatus =
  | "paid"
  | "pending"
  | "overdue"
  | "failed"
  | "cancelled"
  | "refunded"
  | "processing"
  | "active"
  | "inactive"
  | "candidate"
  | "debt"
  | (string & {});

interface StatusConfig {
  label: string;
  icon: React.ElementType;
  classes: string;
  dotColor: string;
}

const statusConfigs: Record<string, StatusConfig> = {
  paid: {
    label: "Pago",
    icon: CheckCircle2,
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dotColor: "bg-emerald-500",
  },
  active: {
    label: "Activo",
    icon: UserCheck,
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dotColor: "bg-emerald-500",
  },
  pending: {
    label: "Pendente",
    icon: Clock,
    classes: "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/25",
    dotColor: "bg-amber-500",
  },
  processing: {
    label: "Em processamento",
    icon: RefreshCw,
    classes: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
    dotColor: "bg-sky-500",
  },
  overdue: {
    label: "Em atraso",
    icon: AlertCircle,
    classes: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
    dotColor: "bg-rose-500",
  },
  debt: {
    label: "Com dívida",
    icon: CircleAlert,
    classes: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
    dotColor: "bg-rose-500",
  },
  failed: {
    label: "Falhado",
    icon: XCircle,
    classes: "bg-destructive/10 text-destructive border-destructive/20",
    dotColor: "bg-destructive",
  },
  cancelled: {
    label: "Cancelado",
    icon: XCircle,
    classes: "bg-muted text-muted-foreground border-border",
    dotColor: "bg-muted-foreground",
  },
  inactive: {
    label: "Inactivo",
    icon: UserX,
    classes: "bg-muted text-muted-foreground border-border",
    dotColor: "bg-muted-foreground",
  },
  refunded: {
    label: "Reembolsado",
    icon: RotateCcw,
    classes: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25",
    dotColor: "bg-purple-500",
  },
  candidate: {
    label: "Candidato",
    icon: UserPlus,
    classes: "bg-primary-soft text-primary-strong border-primary/20",
    dotColor: "bg-primary",
  },
};

const fallbackConfig: StatusConfig = {
  label: "Desconhecido",
  icon: Clock,
  classes: "bg-muted text-muted-foreground border-border",
  dotColor: "bg-muted-foreground",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: SystemStatus;
  label?: string;
  showIcon?: boolean;
  size?: "sm" | "md";
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, showIcon = true, size = "md", className, ...props }, ref) => {
    const normalizedKey = String(status).toLowerCase().trim();
    const config = statusConfigs[normalizedKey] || fallbackConfig;
    const Icon = config.icon;
    const displayLabel = label || config.label;

    return (
      <span
        ref={ref}
        role="status"
        className={cn(
          "inline-flex items-center gap-1.5 font-medium border rounded-full transition-colors select-none",
          size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
          config.classes,
          className,
        )}
        {...props}
      >
        {showIcon ? (
          <Icon
            className={cn("shrink-0", size === "sm" ? "size-3" : "size-3.5")}
            aria-hidden="true"
          />
        ) : (
          <span
            className={cn(
              "shrink-0 rounded-full",
              size === "sm" ? "size-1.5" : "size-2",
              config.dotColor,
            )}
            aria-hidden="true"
          />
        )}
        <span>{displayLabel}</span>
      </span>
    );
  },
);

StatusBadge.displayName = "StatusBadge";
