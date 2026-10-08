import { useState } from "react";
import { Video, Play, LogIn, Square, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reusable classroom controls. Parent must obtain capabilities from a
 * trusted, authenticated server endpoint. This UI is not an authorization boundary.
 */
export type VirtualClassroomState = "scheduled" | "live" | "ended" | "cancelled";
export type VirtualClassroomAction = "create" | "start" | "join" | "end" | "recordings";
export type VirtualClassroomCapabilities = Partial<Record<VirtualClassroomAction, boolean>>;

type Props = {
  status: VirtualClassroomState;
  capabilities: VirtualClassroomCapabilities;
  onAction: (action: VirtualClassroomAction) => Promise<void>;
  disabled?: boolean;
};

const controls: Array<{ action: VirtualClassroomAction; title: string; icon: typeof Video; statuses: VirtualClassroomState[] }> = [
  { action: "create", title: "Criar aula", icon: Video, statuses: ["scheduled"] },
  { action: "start", title: "Iniciar aula", icon: Play, statuses: ["scheduled"] },
  { action: "join", title: "Entrar na aula", icon: LogIn, statuses: ["live"] },
  { action: "end", title: "Terminar aula", icon: Square, statuses: ["live"] },
  { action: "recordings", title: "Ver gravações", icon: Film, statuses: ["ended"] },
];

export function VirtualClassroomControls({ status, capabilities, onAction, disabled }: Props) {
  const [pending, setPending] = useState<VirtualClassroomAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visible = controls.filter(({ action, statuses }) => capabilities[action] === true && statuses.includes(status));
  if (visible.length === 0) return null;

  async function execute(action: VirtualClassroomAction) {
    if (pending || disabled || capabilities[action] !== true) return;
    setError(null);
    setPending(action);
    try {
      await onAction(action);
    } catch {
      setError("Não foi possível concluir a operação. Tente novamente.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2" aria-label="Controlos da aula virtual">
      <div className="flex flex-wrap gap-2">
        {visible.map(({ action, title, icon: Icon }) => (
          <Button key={action} type="button" disabled={disabled || pending !== null}
            variant={action === "end" ? "outline" : "default"} onClick={() => void execute(action)}>
            {pending === action ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="mr-2 h-4 w-4" aria-hidden="true" />}
            {title}
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
