import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { type AcademicStatus, ACADEMIC_STATUS_LABELS } from "@/features/students/academic-status";

export interface StudentStatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: AcademicStatus | string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

const statusTones: Record<AcademicStatus, string> = {
  active: "bg-success/15 text-success border border-success/25",
  applicant: "bg-primary/15 text-primary border border-primary/25",
  inactive: "bg-muted text-muted-foreground border border-border",
  transferred: "bg-warning/15 text-warning border border-warning/25",
  graduated: "bg-primary/15 text-primary border border-primary/25",
  cancelled: "bg-destructive/15 text-destructive border border-destructive/25",
  suspended: "bg-warning/15 text-warning border border-warning/25",
  locked: "bg-muted text-muted-foreground border border-border",
};

const statusDotTones: Record<AcademicStatus, string> = {
  active: "bg-success",
  applicant: "bg-primary",
  inactive: "bg-muted-foreground",
  transferred: "bg-warning",
  graduated: "bg-primary",
  cancelled: "bg-destructive",
  suspended: "bg-warning",
  locked: "bg-muted-foreground",
};

export function StudentStatusBadge({
  status,
  size = "md",
  showIcon = true,
  className,
  ...props
}: StudentStatusBadgeProps) {
  const normStatus = (status in ACADEMIC_STATUS_LABELS ? status : "active") as AcademicStatus;
  const label = ACADEMIC_STATUS_LABELS[normStatus] ?? status;
  const tone = statusTones[normStatus] ?? statusTones.active;
  const dotTone = statusDotTones[normStatus] ?? statusDotTones.active;

  const sizeClasses = {
    sm: "text-[11px] px-2 py-0.5 gap-1",
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
      {...props}
    >
      {showIcon ? (
        <span className={cn("size-1.5 rounded-full shrink-0", dotTone)} aria-hidden="true" />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
