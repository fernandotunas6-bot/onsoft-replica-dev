import type { ElementType } from "react";
import { AlarmClock, CheckCheck, CircleDashed, CircleSlash, Hourglass } from "lucide-react";
import type { ChipTone } from "@/components/ui/icon-chip";
import type { TaskState } from "@/features/academic/task-submissions";

/** Ícone, tom e texto de cada estado de um trabalho; um só sítio para os dois ecrãs. */
export const TASK_STATE_UI: Record<
  TaskState,
  { label: string; icon: ElementType; tone: ChipTone }
> = {
  open: { label: "Por entregar", icon: CircleDashed, tone: "info" },
  overdue: { label: "Atrasado", icon: AlarmClock, tone: "warning" },
  submitted: { label: "Entregue", icon: Hourglass, tone: "primary" },
  returned: { label: "Devolvido", icon: CheckCheck, tone: "success" },
  missed: { label: "Não entregue", icon: CircleSlash, tone: "muted" },
};
