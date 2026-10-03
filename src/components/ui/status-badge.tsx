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
  CircleDot,
  FileEdit,
  GraduationCap,
  Lock,
  MoveRight,
  PauseCircle,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveStatus,
  STATUS_DOT_CLASSES,
  STATUS_TONE_CLASSES,
  type StatusKey,
} from "@/lib/status-registry";

export type SystemStatus = StatusKey | (string & {});

/**
 * O ícone é por estado; a cor vem do tom no registo. Assim um estado novo só
 * precisa de uma linha aqui (e nem isso — sem entrada, usa o ponto neutro).
 */
const statusIcons: Partial<Record<StatusKey, React.ElementType>> = {
  active: UserCheck,
  inactive: UserX,
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  overdue: AlertCircle,
  paid: CheckCircle2,
  partial: PieChart,
  cancelled: XCircle,
  processing: RefreshCw,
  refunded: RotateCcw,
  candidate: UserPlus,
  debt: CircleAlert,
  failed: XCircle,
  draft: FileEdit,
  closed: Lock,
  suspended: PauseCircle,
  transferred: MoveRight,
  graduated: GraduationCap,
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: SystemStatus;
  label?: string;
  showIcon?: boolean;
  size?: "sm" | "md";
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, showIcon = true, size = "md", className, ...props }, ref) => {
    const resolved = resolveStatus(String(status));
    const Icon = (resolved.key ? statusIcons[resolved.key] : undefined) ?? CircleDot;
    const displayLabel = label || resolved.label;

    return (
      <span
        ref={ref}
        role="status"
        title={resolved.hint}
        className={cn(
          "inline-flex items-center gap-1.5 font-medium border rounded-full transition-colors select-none",
          size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
          STATUS_TONE_CLASSES[resolved.tone],
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
              STATUS_DOT_CLASSES[resolved.tone],
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
