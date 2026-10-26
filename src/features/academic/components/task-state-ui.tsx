import type { ChipTone } from "@/components/ui/icon-chip";
import type { TaskState } from "@/features/academic/task-submissions";
import { TASK_STATE_UI } from "./task-state-meta";
import { cn } from "@/lib/utils";

const PILL_TONE: Record<ChipTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success-strong",
  warning: "bg-warning/15 text-warning-foreground dark:text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
  sidebar: "bg-muted text-muted-foreground",
};

/** Pastilha discreta: ícone pequeno e o nome do estado. */
export function StatePill({
  state,
  label,
  className,
}: {
  state: TaskState;
  label?: string;
  className?: string;
}) {
  const ui = TASK_STATE_UI[state];
  const Icon = ui.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        PILL_TONE[ui.tone],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label ?? ui.label}
    </span>
  );
}
