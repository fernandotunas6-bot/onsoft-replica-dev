import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { type AcademicStatus, ACADEMIC_STATUS_LABELS } from "@/features/students/academic-status";

export interface StudentStatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: AcademicStatus | string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

const statusTones: Record<AcademicStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25",
  applicant: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/25",
  inactive: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400 border border-zinc-500/25",
  transferred: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25",
  graduated: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/25",
  cancelled: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/25",
  suspended: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/25",
  locked: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border border-slate-500/25",
};

const statusDotTones: Record<AcademicStatus, string> = {
  active: "bg-emerald-500",
  applicant: "bg-blue-500",
  inactive: "bg-zinc-500",
  transferred: "bg-amber-500",
  graduated: "bg-purple-500",
  cancelled: "bg-rose-500",
  suspended: "bg-orange-500",
  locked: "bg-slate-500",
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
      {...props}
    >
      {showIcon ? (
        <span className={cn("size-1.5 rounded-full shrink-0", dotTone)} aria-hidden="true" />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
